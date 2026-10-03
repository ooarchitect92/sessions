import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileAssetStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import {
  HOST_ROLES,
  hasAnyRole,
  type Principal,
} from '../common/auth/principal';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { RealtimeEventsService } from '../infrastructure/realtime-events.service';
import { OutboxService } from '../outbox/outbox.service';
import { S3ObjectStoreService } from '../recordings/s3-object-store.service';
import { CreateFileUploadDto } from './dto/create-file-upload.dto';

const SUPPORTED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
  'text/markdown',
  'video/mp4',
  'video/webm',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

@Injectable()
export class FilesService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly objectStore: S3ObjectStoreService,
    private readonly realtime: RealtimeEventsService,
  ) {}

  async createUpload(
    principal: Principal,
    sessionId: string,
    input: CreateFileUploadDto,
  ) {
    this.assertHost(principal);
    const maxBytes = this.config.get<number>('FILE_UPLOAD_MAX_BYTES', 52_428_800);
    if (input.sizeBytes > maxBytes) {
      throw new BadRequestException(
        `File exceeds the configured upload limit of ${maxBytes} bytes`,
      );
    }

    const mimeType = input.mimeType.trim().toLowerCase();
    if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
      throw new BadRequestException(
        'Unsupported file type. Upload PDF, image, text, video, DOCX, PPTX, or XLSX files.',
      );
    }

    const filename = this.safeFilename(input.filename);
    const asset = await this.database.run(principal, async (transaction) => {
      const session = await transaction.session.findUnique({
        where: { id: sessionId },
        select: { id: true },
      });
      if (!session) throw new NotFoundException('Session not found');

      const id = crypto.randomUUID();
      const quarantineKey = [
        'quarantine',
        'organizations',
        principal.organizationId,
        'workspaces',
        principal.workspaceId,
        'sessions',
        sessionId,
        'files',
        id,
        filename,
      ].join('/');

      const created = await transaction.fileAsset.create({
        data: {
          id,
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          sessionId,
          createdById: principal.userId,
          filename,
          mimeType,
          sizeBytes: BigInt(input.sizeBytes),
          quarantineKey,
          status: FileAssetStatus.PENDING_UPLOAD,
        },
      });

      await this.audit.record(transaction, principal, {
        action: 'file.upload.requested',
        resourceType: 'file_asset',
        resourceId: created.id,
        metadata: {
          sessionId,
          filename,
          mimeType,
          sizeBytes: input.sizeBytes,
        },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'file_asset',
        aggregateId: created.id,
        eventType: 'file.upload.requested',
        payload: {
          fileId: created.id,
          sessionId,
          filename,
          mimeType,
          sizeBytes: input.sizeBytes,
        },
      });

      return created;
    });

    const expiresIn = this.config.get<number>('FILE_UPLOAD_TTL_SECONDS', 900);
    return {
      file: this.serialize(asset),
      upload: {
        method: 'PUT',
        url: this.objectStore.createUploadUrl(
          asset.quarantineKey,
          expiresIn,
        ),
        expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
        contentType: asset.mimeType,
      },
    };
  }

  async completeUpload(principal: Principal, fileId: string) {
    this.assertHost(principal);

    const asset = await this.database.run(principal, async (transaction) => {
      const current = await transaction.fileAsset.findUnique({ where: { id: fileId } });
      if (!current) throw new NotFoundException('File asset not found');
      if (current.status !== FileAssetStatus.PENDING_UPLOAD) {
        throw new ConflictException(
          `Upload cannot be completed while file is ${current.status}`,
        );
      }
      return current;
    });

    const metadata = await this.objectStore.headObject(asset.quarantineKey);
    const expectedSize = Number(asset.sizeBytes);
    if (metadata.sizeBytes !== expectedSize) {
      throw new BadRequestException(
        `Uploaded file size mismatch. Expected ${expectedSize} bytes, received ${metadata.sizeBytes} bytes.`,
      );
    }

    const updated = await this.database.run(principal, async (transaction) => {
      const result = await transaction.fileAsset.updateMany({
        where: {
          id: fileId,
          status: FileAssetStatus.PENDING_UPLOAD,
        },
        data: {
          status: FileAssetStatus.QUARANTINED,
          uploadedAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (result.count === 0) {
        throw new ConflictException('File upload was already completed');
      }

      const current = await transaction.fileAsset.findUniqueOrThrow({
        where: { id: fileId },
      });
      await this.audit.record(transaction, principal, {
        action: 'file.upload.quarantined',
        resourceType: 'file_asset',
        resourceId: fileId,
        metadata: {
          sessionId: current.sessionId,
          filename: current.filename,
        },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'file_asset',
        aggregateId: fileId,
        eventType: 'file.upload.quarantined',
        payload: {
          fileId,
          sessionId: current.sessionId,
          filename: current.filename,
        },
      });
      return current;
    });

    this.publish(updated.sessionId, updated.id, updated.status);
    return this.serialize(updated);
  }

  async listSessionFiles(principal: Principal, sessionId: string) {
    return this.database.run(principal, async (transaction) => {
      const session = await transaction.session.findUnique({
        where: { id: sessionId },
        select: { id: true },
      });
      if (!session) throw new NotFoundException('Session not found');

      const files = await transaction.fileAsset.findMany({
        where: {
          sessionId,
          status: { not: FileAssetStatus.DELETED },
        },
        orderBy: { createdAt: 'desc' },
      });
      return files.map((file) => this.serialize(file));
    });
  }

  async createDownloadGrant(principal: Principal, fileId: string) {
    const asset = await this.database.run(principal, async (transaction) => {
      const file = await transaction.fileAsset.findUnique({ where: { id: fileId } });
      if (!file) throw new NotFoundException('File asset not found');
      return file;
    });

    if (
      asset.status !== FileAssetStatus.READY ||
      !asset.cleanObjectKey
    ) {
      throw new ConflictException(
        `File is not available for download while status is ${asset.status}`,
      );
    }

    const expiresIn = this.config.get<number>('FILE_DOWNLOAD_TTL_SECONDS', 300);
    return {
      fileId: asset.id,
      filename: asset.filename,
      mimeType: asset.mimeType,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      url: this.objectStore.createAttachmentUrl(
        asset.cleanObjectKey,
        asset.filename,
        expiresIn,
      ),
    };
  }

  async remove(principal: Principal, fileId: string) {
    this.assertHost(principal);
    const asset = await this.database.run(principal, async (transaction) => {
      const file = await transaction.fileAsset.findUnique({ where: { id: fileId } });
      if (!file) throw new NotFoundException('File asset not found');
      return file;
    });

    if (asset.cleanObjectKey) {
      await this.objectStore.deleteObject(asset.cleanObjectKey);
    }
    if (asset.status !== FileAssetStatus.READY) {
      await this.objectStore.deleteObject(asset.quarantineKey);
    }

    const deleted = await this.database.run(principal, async (transaction) => {
      const current = await transaction.fileAsset.update({
        where: { id: fileId },
        data: {
          status: FileAssetStatus.DELETED,
          deletedAt: new Date(),
          version: { increment: 1 },
        },
      });
      await this.audit.record(transaction, principal, {
        action: 'file.deleted',
        resourceType: 'file_asset',
        resourceId: fileId,
        metadata: {
          sessionId: current.sessionId,
          filename: current.filename,
        },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'file_asset',
        aggregateId: fileId,
        eventType: 'file.deleted',
        payload: {
          fileId,
          sessionId: current.sessionId,
          filename: current.filename,
        },
      });
      return current;
    });

    this.publish(deleted.sessionId, deleted.id, deleted.status);
    return { id: fileId, deleted: true as const };
  }

  private serialize(asset: {
    id: string;
    organizationId: string;
    workspaceId: string;
    sessionId: string | null;
    createdById: string;
    filename: string;
    mimeType: string;
    sizeBytes: bigint;
    checksumSha256: string | null;
    status: FileAssetStatus;
    scanProvider: string | null;
    scanResult: string | null;
    scanAttempts: number;
    lastScanError: string | null;
    uploadedAt: Date | null;
    scannedAt: Date | null;
    deletedAt: Date | null;
    version: number;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      ...asset,
      sizeBytes: Number(asset.sizeBytes),
    };
  }

  private publish(
    sessionId: string | null,
    fileId: string,
    status: FileAssetStatus,
  ): void {
    if (!sessionId) return;
    this.realtime.publishSessionEvent({
      sessionId,
      eventName: 'file.asset.updated',
      payload: { sessionId, fileId, status },
    });
  }

  private assertHost(principal: Principal): void {
    if (!hasAnyRole(principal, HOST_ROLES)) {
      throw new ForbiddenException('A host role is required');
    }
  }

  private safeFilename(value: string): string {
    const normalized = value
      .normalize('NFKD')
      .replace(/[^w.-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 220);
    if (!normalized) throw new BadRequestException('File name is invalid');
    return normalized;
  }
}
