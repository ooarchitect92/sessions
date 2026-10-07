import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { Prisma, UploadStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import { WorkerPrismaService } from '../database/worker-prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { S3ObjectStoreService } from '../recordings/s3-object-store.service';
import { MalwareScannerService } from './malware-scanner.service';

@Injectable()
export class UploadScanWorker {
  private readonly logger = new Logger(UploadScanWorker.name);
  private running = false;

  constructor(
    private readonly prisma: WorkerPrismaService,
    private readonly objectStore: S3ObjectStoreService,
    private readonly scanner: MalwareScannerService,
    private readonly outbox: OutboxService,
    private readonly config: ConfigService,
  ) {}

  @Interval(1500)
  async runCycle(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.scanPending();
      await this.expireAbandoned();
    } catch (error: unknown) {
      this.logger.error(
        'Upload scan cycle failed',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
  }

  private async scanPending(): Promise<void> {
    const assets = await this.prisma.uploadAsset.findMany({
      where: { status: UploadStatus.PENDING_SCAN },
      orderBy: { scanRequestedAt: 'asc' },
      take: 5,
    });

    for (const asset of assets) {
      const claimed = await this.prisma.uploadAsset.updateMany({
        where: { id: asset.id, status: UploadStatus.PENDING_SCAN },
        data: { status: UploadStatus.SCANNING },
      });
      if (claimed.count === 0) continue;

      try {
        const maxBytes = this.config.get<number>('UPLOAD_MAX_BYTES', 25 * 1024 * 1024);
        const buffer = await this.objectStore.downloadObject(asset.objectKey, maxBytes);
        const checksum = createHash('sha256').update(buffer).digest('hex');

        if (
          asset.checksumSha256 &&
          asset.checksumSha256.toLowerCase() !== checksum
        ) {
          await this.reject(asset, checksum, 'checksum_mismatch', 'checksum');
          continue;
        }

        const result = await this.scanner.scan(buffer);
        if (!result.clean) {
          await this.reject(asset, checksum, result.result, result.provider);
          continue;
        }

        await this.prisma.uploadAsset.update({
          where: { id: asset.id },
          data: {
            status: UploadStatus.READY,
            checksumSha256: checksum,
            scanProvider: result.provider,
            scanResult: result.result,
            scannedAt: new Date(),
          },
        });
        await this.emit(asset, 'upload.ready', {
          uploadId: asset.id,
          sessionId: asset.sessionId,
          checksumSha256: checksum,
          scanProvider: result.provider,
        });
      } catch (error: unknown) {
        const message = this.message(error);
        await this.prisma.uploadAsset.update({
          where: { id: asset.id },
          data: {
            status: UploadStatus.FAILED,
            scanResult: message,
            scannedAt: new Date(),
          },
        });
        await this.emit(asset, 'upload.failed', {
          uploadId: asset.id,
          sessionId: asset.sessionId,
          failureCode: message,
        });
      }
    }
  }

  private async reject(
    asset: {
      id: string;
      organizationId: string;
      workspaceId: string;
      sessionId: string | null;
      objectKey: string;
    },
    checksum: string,
    result: string,
    provider: string,
  ): Promise<void> {
    await this.objectStore.deleteObject(asset.objectKey).catch((error: unknown) => {
      this.logger.warn(
        `Unable to delete rejected upload ${asset.id}: ${this.message(error)}`,
      );
    });
    await this.prisma.uploadAsset.update({
      where: { id: asset.id },
      data: {
        status: UploadStatus.REJECTED,
        checksumSha256: checksum,
        scanProvider: provider,
        scanResult: result.slice(0, 160),
        scannedAt: new Date(),
      },
    });
    await this.emit(asset, 'upload.rejected', {
      uploadId: asset.id,
      sessionId: asset.sessionId,
      scanProvider: provider,
      scanResult: result.slice(0, 160),
    });
  }

  private async expireAbandoned(): Promise<void> {
    const expired = await this.prisma.uploadAsset.findMany({
      where: {
        status: UploadStatus.AWAITING_UPLOAD,
        expiresAt: { lt: new Date() },
      },
      take: 20,
    });
    for (const asset of expired) {
      await this.objectStore.deleteObject(asset.objectKey).catch(() => undefined);
      await this.prisma.uploadAsset.updateMany({
        where: { id: asset.id, status: UploadStatus.AWAITING_UPLOAD },
        data: {
          status: UploadStatus.DELETED,
          scanResult: 'upload_expired_before_completion',
        },
      });
    }
  }

  private async emit(
    asset: {
      id: string;
      organizationId: string;
      workspaceId: string;
    },
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await this.outbox.enqueue(
        transaction,
        {
          organizationId: asset.organizationId,
          workspaceId: asset.workspaceId,
        },
        {
          aggregateType: 'upload_asset',
          aggregateId: asset.id,
          eventType,
          payload: JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonObject,
        },
      );
    });
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message.slice(0, 160) : 'unknown';
  }
}
