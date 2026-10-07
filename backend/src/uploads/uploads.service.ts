import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, UploadStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import type { Principal } from '../common/auth/principal';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { OutboxService } from '../outbox/outbox.service';
import { S3ObjectStoreService } from '../recordings/s3-object-store.service';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import { CreateUploadDto } from './dto/create-upload.dto';

const ALLOWED_MIME_PREFIXES = [
  'image/',
  'video/',
  'audio/',
  'text/',
] as const;

const ALLOWED_EXACT_MIME_TYPES = new Set([
  'application/pdf',
  'application/json',
  'application/zip',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

@Injectable()
export class UploadsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly objectStore: S3ObjectStoreService,
    private readonly config: ConfigService,
  ) {}

  async create(principal: Principal, input: CreateUploadDto) {
    const maxBytes = this.config.get<number>('UPLOAD_MAX_BYTES', 25 * 1024 * 1024);
    if (input.sizeBytes <= 0 || input.sizeBytes > maxBytes) {
      throw new BadRequestException(`Upload must be between 1 and ${maxBytes} bytes`);
    }
    if (!this.isAllowedMimeType(input.mimeType)) {
      throw new BadRequestException('This file type is not allowed');
    }

    const id = randomUUID();
    const filename = this.safeFilename(input.filename);
    const objectKey = [
      'organizations',
      principal.organizationId,
      'workspaces',
      principal.workspaceId,
      'quarantine',
      id,
      filename,
    ].join('/');
    const ttlSeconds = this.config.get<number>('UPLOAD_URL_TTL_SECONDS', 300);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    const asset = await this.database.run(principal, async (transaction) => {
      if (input.sessionId) {
        const session = await transaction.session.findUnique({
          where: { id: input.sessionId },
          select: { id: true },
        });
        if (!session) throw new NotFoundException('Session not found');
      }

      const created = await transaction.uploadAsset.create({
        data: {
          id,
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          sessionId: input.sessionId ?? null,
          createdById: principal.userId,
          purpose: input.purpose,
          originalFilename: filename,
          mimeType: input.mimeType.toLowerCase(),
          expectedSizeBytes: input.sizeBytes,
          objectKey,
          expiresAt,
        },
      });

      await this.audit.record(transaction, principal, {
        action: 'upload.created',
        resourceType: 'upload_asset',
        resourceId: created.id,
        metadata: {
          purpose: created.purpose,
          sessionId: created.sessionId,
          expectedSizeBytes: created.expectedSizeBytes,
          mimeType: created.mimeType,
        },
      });

      return created;
    });

    return {
      asset: this.publicAsset(asset),
      upload: {
        method: 'PUT' as const,
        url: this.objectStore.createUploadUrl(objectKey, ttlSeconds),
        expiresAt,
        maxBytes,
      },
    };
  }

  async complete(
    principal: Principal,
    id: string,
    input: CompleteUploadDto,
  ) {
    const existing = await this.database.run(principal, async (transaction) =>
      transaction.uploadAsset.findUnique({ where: { id } }),
    );
    if (!existing) throw new NotFoundException('Upload not found');
    if (existing.status !== UploadStatus.AWAITING_UPLOAD) {
      if (
        [
          UploadStatus.PENDING_SCAN,
          UploadStatus.SCANNING,
          UploadStatus.READY,
        ].includes(existing.status)
      ) {
        return this.publicAsset(existing);
      }
      throw new ConflictException(`Upload cannot be completed from ${existing.status}`);
    }
    if (existing.expiresAt.getTime() < Date.now()) {
      throw new ConflictException('Upload URL has expired');
    }

    let metadata: { sizeBytes: number; contentType: string | null };
    try {
      metadata = await this.objectStore.headObject(existing.objectKey);
    } catch {
      throw new ConflictException('Uploaded object was not found');
    }

    if (
      metadata.sizeBytes <= 0 ||
      metadata.sizeBytes !== existing.expectedSizeBytes
    ) {
      throw new BadRequestException(
        `Uploaded size ${metadata.sizeBytes} does not match expected size ${existing.expectedSizeBytes}`,
      );
    }

    const updated = await this.database.run(principal, async (transaction) => {
      const claimed = await transaction.uploadAsset.updateMany({
        where: { id, status: UploadStatus.AWAITING_UPLOAD },
        data: {
          status: UploadStatus.PENDING_SCAN,
          actualSizeBytes: metadata.sizeBytes,
          checksumSha256: input.checksumSha256?.toLowerCase() ?? null,
          scanRequestedAt: new Date(),
        },
      });
      if (claimed.count === 0) {
        const current = await transaction.uploadAsset.findUnique({ where: { id } });
        if (!current) throw new NotFoundException('Upload not found');
        return current;
      }

      const current = await transaction.uploadAsset.findUniqueOrThrow({
        where: { id },
      });
      await this.audit.record(transaction, principal, {
        action: 'upload.scan_requested',
        resourceType: 'upload_asset',
        resourceId: id,
        metadata: {
          sizeBytes: metadata.sizeBytes,
          checksumProvided: Boolean(input.checksumSha256),
        },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'upload_asset',
        aggregateId: id,
        eventType: 'upload.scan.requested',
        payload: {
          uploadId: id,
          workspaceId: principal.workspaceId,
          sessionId: current.sessionId,
        },
      });
      return current;
    });

    return this.publicAsset(updated);
  }

  async get(principal: Principal, id: string) {
    const asset = await this.database.run(principal, async (transaction) =>
      transaction.uploadAsset.findUnique({ where: { id } }),
    );
    if (!asset) throw new NotFoundException('Upload not found');
    return this.publicAsset(asset);
  }

  async createDownloadGrant(principal: Principal, id: string) {
    return this.database.run(principal, async (transaction) => {
      const asset = await transaction.uploadAsset.findUnique({ where: { id } });
      if (!asset) throw new NotFoundException('Upload not found');
      if (asset.status !== UploadStatus.READY) {
        throw new ConflictException('File is not available for download');
      }

      const ttlSeconds = this.config.get<number>('UPLOAD_DOWNLOAD_TTL_SECONDS', 300);
      await this.audit.record(transaction, principal, {
        action: 'upload.download_granted',
        resourceType: 'upload_asset',
        resourceId: asset.id,
        metadata: { expiresInSeconds: ttlSeconds },
      });

      return {
        asset: this.publicAsset(asset),
        url: this.objectStore.createAttachmentUrl(
          asset.objectKey,
          asset.originalFilename,
          ttlSeconds,
        ),
        expiresIn: ttlSeconds,
      };
    });
  }

  private publicAsset(asset: {
    id: string;
    sessionId: string | null;
    purpose: string;
    status: UploadStatus;
    originalFilename: string;
    mimeType: string;
    expectedSizeBytes: number;
    actualSizeBytes: number | null;
    checksumSha256: string | null;
    scanProvider: string | null;
    scanResult: string | null;
    scannedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: asset.id,
      sessionId: asset.sessionId,
      purpose: asset.purpose,
      status: asset.status,
      filename: asset.originalFilename,
      mimeType: asset.mimeType,
      expectedSizeBytes: asset.expectedSizeBytes,
      actualSizeBytes: asset.actualSizeBytes,
      checksumSha256: asset.status === UploadStatus.READY ? asset.checksumSha256 : null,
      scanProvider: asset.scanProvider,
      scanResult:
        asset.status === UploadStatus.REJECTED ||
        asset.status === UploadStatus.FAILED
          ? asset.scanResult
          : null,
      scannedAt: asset.scannedAt,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    };
  }

  private isAllowedMimeType(value: string): boolean {
    const normalized = value.toLowerCase();
    return (
      ALLOWED_EXACT_MIME_TYPES.has(normalized) ||
      ALLOWED_MIME_PREFIXES.some((prefix) => normalized.startsWith(prefix))
    );
  }

  private safeFilename(value: string): string {
    const normalized = value
      .normalize('NFKD')
      .replace(/[^\w.-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!normalized) return 'upload.bin';
    return normalized.slice(0, 180);
  }
}
