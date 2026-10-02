import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { ArtifactStatus, Prisma, SessionStatus } from '@prisma/client';
import {
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  S3Upload,
  type EgressInfo,
} from 'livekit-server-sdk';
import { WorkerPrismaService } from '../database/worker-prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { classifyEgressStatus } from './recording-egress-state';
import { S3ObjectStoreService } from './s3-object-store.service';

@Injectable()
export class RecordingEgressWorker {
  private readonly logger = new Logger(RecordingEgressWorker.name);
  private readonly enabled: boolean;
  private readonly client: EgressClient;
  private running = false;

  constructor(
    private readonly prisma: WorkerPrismaService,
    private readonly config: ConfigService,
    private readonly outbox: OutboxService,
    private readonly objectStore: S3ObjectStoreService,
  ) {
    this.enabled = config.get<boolean>('LIVEKIT_EGRESS_ENABLED', false);
    this.client = new EgressClient(
      config.getOrThrow<string>('LIVEKIT_API_URL'),
      config.getOrThrow<string>('LIVEKIT_API_KEY'),
      config.getOrThrow<string>('LIVEKIT_API_SECRET'),
    );
  }

  @Interval(2000)
  async runCycle(): Promise<void> {
    if (!this.enabled || this.running) return;
    this.running = true;
    try {
      await this.startPendingRecordings();
      await this.stopEndedRecordings();
      await this.reconcileRecordings();
      await this.expireRetention();
      await this.deleteRequestedRecordings();
      await this.failNeverStartedRecordings();
    } catch (error: unknown) {
      this.logger.error(
        'Recording worker cycle failed',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
  }

  private async startPendingRecordings(): Promise<void> {
    const recordings = await this.prisma.recording.findMany({
      where: {
        status: ArtifactStatus.PENDING,
        providerJobId: null,
        session: { is: { status: SessionStatus.LIVE } },
      },
      include: { session: true },
      orderBy: { createdAt: 'asc' },
      take: 5,
    });

    for (const recording of recordings) {
      const claimed = await this.prisma.recording.updateMany({
        where: {
          id: recording.id,
          status: ArtifactStatus.PENDING,
          providerJobId: null,
        },
        data: {
          status: ArtifactStatus.PROCESSING,
          provider: 'livekit',
          startedAt: new Date(),
          failureCode: null,
          version: { increment: 1 },
        },
      });
      if (claimed.count === 0) continue;

      const objectKey = [
        'organizations',
        recording.organizationId,
        'workspaces',
        recording.workspaceId,
        'sessions',
        recording.sessionId,
        `recording-${recording.id}.mp4`,
      ].join('/');

      try {
        const output = new EncodedFileOutput({
          fileType: EncodedFileType.MP4,
          filepath: objectKey,
          output: {
            case: 's3',
            value: new S3Upload({
              accessKey: this.config.getOrThrow<string>('S3_ACCESS_KEY'),
              secret: this.config.getOrThrow<string>('S3_SECRET_KEY'),
              region: this.config.getOrThrow<string>('S3_REGION'),
              endpoint: this.config.getOrThrow<string>('S3_ENDPOINT'),
              bucket: this.config.getOrThrow<string>('S3_BUCKET'),
              forcePathStyle: this.config.get<boolean>('S3_FORCE_PATH_STYLE', true),
              contentDisposition: 'inline',
              metadata: {
                organizationId: recording.organizationId,
                workspaceId: recording.workspaceId,
                sessionId: recording.sessionId,
                recordingId: recording.id,
              },
            }),
          },
        });
        const info = await this.client.startRoomCompositeEgress(
          recording.session.livekitRoomName,
          { file: output },
          {
            layout: this.config.get<string>('LIVEKIT_EGRESS_LAYOUT', 'grid-dark'),
          },
        );
        await this.prisma.recording.update({
          where: { id: recording.id },
          data: {
            providerJobId: info.egressId,
            objectKey,
            playbackObjectKey: objectKey,
            status: ArtifactStatus.PROCESSING,
            version: { increment: 1 },
          },
        });
        await this.emit(recording, 'recording.started', {
          recordingId: recording.id,
          sessionId: recording.sessionId,
          providerJobId: info.egressId,
          objectKey,
        });
      } catch (error: unknown) {
        await this.failRecording(
          recording,
          `egress_start_failed:${this.message(error)}`,
        );
      }
    }
  }

  private async stopEndedRecordings(): Promise<void> {
    const recordings = await this.prisma.recording.findMany({
      where: {
        status: ArtifactStatus.PROCESSING,
        providerJobId: { not: null },
        stopRequestedAt: null,
        session: {
          is: {
            status: {
              in: [
                SessionStatus.ENDED,
                SessionStatus.CANCELLED,
                SessionStatus.FAILED,
              ],
            },
          },
        },
      },
      orderBy: { updatedAt: 'asc' },
      take: 10,
    });

    for (const recording of recordings) {
      if (!recording.providerJobId) continue;
      try {
        await this.client.stopEgress(recording.providerJobId);
        await this.prisma.recording.updateMany({
          where: { id: recording.id, stopRequestedAt: null },
          data: {
            stopRequestedAt: new Date(),
            version: { increment: 1 },
          },
        });
      } catch (error: unknown) {
        const message = this.message(error);
        if (!message.toLowerCase().includes('not found')) {
          this.logger.warn(
            `Unable to stop egress ${recording.providerJobId}: ${message}`,
          );
        }
      }
    }
  }

  private async reconcileRecordings(): Promise<void> {
    const recordings = await this.prisma.recording.findMany({
      where: {
        status: ArtifactStatus.PROCESSING,
        providerJobId: { not: null },
      },
      orderBy: { updatedAt: 'asc' },
      take: 20,
    });

    for (const recording of recordings) {
      if (!recording.providerJobId) continue;
      try {
        const [info] = await this.client.listEgress({
          egressId: recording.providerJobId,
        });
        if (!info) continue;
        const state = classifyEgressStatus(info.status);
        if (state === 'COMPLETE') {
          await this.completeRecording(recording, info);
        } else if (state === 'FAILED') {
          await this.failRecording(
            recording,
            `egress_failed:${(info.error || info.details || 'unknown').slice(0, 120)}`,
          );
        }
      } catch (error: unknown) {
        this.logger.warn(
          `Unable to reconcile recording ${recording.id}: ${this.message(error)}`,
        );
      }
    }
  }

  private async completeRecording(
    recording: {
      id: string;
      organizationId: string;
      workspaceId: string;
      sessionId: string;
      objectKey: string | null;
      playbackObjectKey: string | null;
    },
    info: EgressInfo,
  ): Promise<void> {
    const file = info.fileResults?.[0];
    const durationSeconds = file
      ? Math.max(0, Math.round(this.toNumber(file.duration) / 1_000_000_000))
      : null;
    const sizeBytes = file ? String(file.size) : null;
    await this.prisma.recording.update({
      where: { id: recording.id },
      data: {
        status: ArtifactStatus.READY,
        mimeType: 'video/mp4',
        sizeBytes,
        durationSeconds,
        completedAt: new Date(),
        failureCode: null,
        version: { increment: 1 },
      },
    });
    await this.emit(recording, 'recording.ready', {
      recordingId: recording.id,
      sessionId: recording.sessionId,
      objectKey: recording.objectKey,
      playbackObjectKey: recording.playbackObjectKey,
      durationSeconds,
      sizeBytes,
    });
  }

  private async expireRetention(): Promise<void> {
    await this.prisma.recording.updateMany({
      where: {
        status: ArtifactStatus.READY,
        retentionUntil: { lte: new Date() },
      },
      data: {
        status: ArtifactStatus.DELETING,
        deletionRequestedAt: new Date(),
        version: { increment: 1 },
      },
    });
  }

  private async deleteRequestedRecordings(): Promise<void> {
    const recordings = await this.prisma.recording.findMany({
      where: { status: ArtifactStatus.DELETING },
      orderBy: { deletionRequestedAt: 'asc' },
      take: 10,
    });

    for (const recording of recordings) {
      try {
        const keys = new Set(
          [recording.objectKey, recording.playbackObjectKey].filter(
            (value): value is string => Boolean(value),
          ),
        );
        for (const key of keys) {
          await this.objectStore.deleteObject(key);
        }
        await this.prisma.recording.update({
          where: { id: recording.id },
          data: {
            status: ArtifactStatus.DELETED,
            objectKey: null,
            playbackObjectKey: null,
            deletedAt: new Date(),
            version: { increment: 1 },
          },
        });
        await this.emit(recording, 'recording.deleted', {
          recordingId: recording.id,
          sessionId: recording.sessionId,
        });
      } catch (error: unknown) {
        await this.prisma.recording.update({
          where: { id: recording.id },
          data: {
            failureCode: `delete_failed:${this.message(error)}`.slice(0, 160),
            version: { increment: 1 },
          },
        });
      }
    }
  }

  private async failNeverStartedRecordings(): Promise<void> {
    const stale = await this.prisma.recording.findMany({
      where: {
        status: ArtifactStatus.PENDING,
        providerJobId: null,
        session: {
          is: {
            status: {
              in: [
                SessionStatus.ENDED,
                SessionStatus.CANCELLED,
                SessionStatus.FAILED,
              ],
            },
          },
        },
      },
      take: 20,
    });
    for (const recording of stale) {
      await this.failRecording(recording, 'recording_not_started');
    }
  }

  private async failRecording(
    recording: {
      id: string;
      organizationId: string;
      workspaceId: string;
      sessionId: string;
    },
    failureCode: string,
  ): Promise<void> {
    await this.prisma.recording.update({
      where: { id: recording.id },
      data: {
        status: ArtifactStatus.FAILED,
        failureCode: failureCode.slice(0, 160),
        completedAt: new Date(),
        version: { increment: 1 },
      },
    });
    await this.emit(recording, 'recording.failed', {
      recordingId: recording.id,
      sessionId: recording.sessionId,
      failureCode: failureCode.slice(0, 160),
    });
  }

  private async emit(
    recording: {
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
          organizationId: recording.organizationId,
          workspaceId: recording.workspaceId,
        },
        {
          aggregateType: 'recording',
          aggregateId: recording.id,
          eventType,
          payload: JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonObject,
        },
      );
    });
  }

  private toNumber(value: bigint | number | string | undefined): number {
    if (value === undefined) return 0;
    return typeof value === 'bigint' ? Number(value) : Number(value);
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message.slice(0, 140) : 'unknown';
  }
}
