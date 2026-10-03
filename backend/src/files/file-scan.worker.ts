import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { FileAssetStatus, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { WorkerPrismaService } from '../database/worker-prisma.service';
import { RealtimeEventsService } from '../infrastructure/realtime-events.service';
import { OutboxService } from '../outbox/outbox.service';
import { S3ObjectStoreService } from '../recordings/s3-object-store.service';
import { ClamAvScannerService } from './clamav-scanner.service';

@Injectable()
export class FileScanWorker {
  private readonly logger = new Logger(FileScanWorker.name);
  private readonly enabled: boolean;
  private running = false;

  constructor(
    private readonly prisma: WorkerPrismaService,
    private readonly config: ConfigService,
    private readonly scanner: ClamAvScannerService,
    private readonly objectStore: S3ObjectStoreService,
    private readonly outbox: OutboxService,
    private readonly realtime: RealtimeEventsService,
  ) {
    this.enabled = config.get<boolean>('FILE_SCAN_ENABLED', false);
  }

  @Interval(2500)
  async runCycle(): Promise<void> {
    if (!this.enabled || this.running) return;
    this.running = true;
    try {
      await this.scanNextBatch();
    } catch (error: unknown) {
      this.logger.error(
        'File scan worker cycle failed',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
  }

  private async scanNextBatch(): Promise<void> {
    const candidates = await this.prisma.fileAsset.findMany({
      where: { status: FileAssetStatus.QUARANTINED },
      orderBy: { uploadedAt: 'asc' },
      take: 5,
    });

    for (const candidate of candidates) {
      const claimed = await this.prisma.fileAsset.updateMany({
        where: {
          id: candidate.id,
          status: FileAssetStatus.QUARANTINED,
        },
        data: {
          status: FileAssetStatus.SCANNING,
          scanAttempts: { increment: 1 },
          lastScanError: null,
          version: { increment: 1 },
        },
      });
      if (claimed.count === 0) continue;

      try {
        await this.scanOne(candidate.id);
      } catch (error: unknown) {
        await this.handleFailure(candidate.id, error);
      }
    }
  }

  private async scanOne(fileId: string): Promise<void> {
    const asset = await this.prisma.fileAsset.findUniqueOrThrow({
      where: { id: fileId },
    });
    const maxBytes = this.config.get<number>('FILE_UPLOAD_MAX_BYTES', 52_428_800);
    const bytes = await this.objectStore.downloadObject(
      asset.quarantineKey,
      maxBytes,
    );
    if (bytes.byteLength !== Number(asset.sizeBytes)) {
      throw new Error(
        `Stored object size changed during quarantine (${bytes.byteLength} != ${asset.sizeBytes.toString()})`,
      );
    }

    const checksumSha256 = createHash('sha256').update(bytes).digest('hex');
    const scan = await this.scanner.scan(bytes);
    if (!scan.clean) {
      await this.objectStore.deleteObject(asset.quarantineKey);
      const rejected = await this.prisma.$transaction(async (transaction) => {
        const current = await transaction.fileAsset.update({
          where: { id: asset.id },
          data: {
            status: FileAssetStatus.REJECTED,
            checksumSha256,
            scanProvider: 'clamav',
            scanResult: scan.signature ?? 'malware-detected',
            scannedAt: new Date(),
            lastScanError: null,
            version: { increment: 1 },
          },
        });
        await this.outbox.enqueue(
          transaction as Prisma.TransactionClient,
          {
            organizationId: asset.organizationId,
            workspaceId: asset.workspaceId,
          },
          {
            aggregateType: 'file_asset',
            aggregateId: asset.id,
            eventType: 'file.rejected',
            payload: {
              fileId: asset.id,
              sessionId: asset.sessionId,
              filename: asset.filename,
              reason: scan.signature ?? 'malware-detected',
            },
          },
        );
        return current;
      });
      this.publish(rejected.sessionId, rejected.id, rejected.status);
      return;
    }

    const cleanObjectKey = [
      'organizations',
      asset.organizationId,
      'workspaces',
      asset.workspaceId,
      ...(asset.sessionId ? ['sessions', asset.sessionId] : []),
      'files',
      asset.id,
      asset.filename,
    ].join('/');

    await this.objectStore.uploadObject(
      cleanObjectKey,
      bytes,
      asset.mimeType,
    );
    await this.objectStore.deleteObject(asset.quarantineKey);

    const ready = await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.fileAsset.update({
        where: { id: asset.id },
        data: {
          status: FileAssetStatus.READY,
          cleanObjectKey,
          checksumSha256,
          scanProvider: 'clamav',
          scanResult: 'clean',
          scannedAt: new Date(),
          lastScanError: null,
          version: { increment: 1 },
        },
      });
      await this.outbox.enqueue(
        transaction as Prisma.TransactionClient,
        {
          organizationId: asset.organizationId,
          workspaceId: asset.workspaceId,
        },
        {
          aggregateType: 'file_asset',
          aggregateId: asset.id,
          eventType: 'file.ready',
          payload: {
            fileId: asset.id,
            sessionId: asset.sessionId,
            filename: asset.filename,
            mimeType: asset.mimeType,
            sizeBytes: Number(asset.sizeBytes),
            checksumSha256,
          },
        },
      );
      return current;
    });

    this.publish(ready.sessionId, ready.id, ready.status);
  }

  private async handleFailure(fileId: string, error: unknown): Promise<void> {
    const asset = await this.prisma.fileAsset.findUnique({
      where: { id: fileId },
    });
    if (!asset) return;

    const message =
      error instanceof Error ? error.message.slice(0, 4000) : 'Unknown scan error';
    const maxAttempts = this.config.get<number>('FILE_SCAN_MAX_ATTEMPTS', 3);
    const terminal = asset.scanAttempts >= maxAttempts;

    const updated = await this.prisma.fileAsset.update({
      where: { id: fileId },
      data: {
        status: terminal
          ? FileAssetStatus.FAILED
          : FileAssetStatus.QUARANTINED,
        lastScanError: message,
        version: { increment: 1 },
      },
    });

    if (terminal) {
      this.logger.error(`File scan failed permanently for ${fileId}: ${message}`);
      this.publish(updated.sessionId, updated.id, updated.status);
    } else {
      this.logger.warn(`File scan will retry for ${fileId}: ${message}`);
    }
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
}
