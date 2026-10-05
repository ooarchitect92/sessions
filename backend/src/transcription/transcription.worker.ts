import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { ArtifactStatus } from '@prisma/client';
import { WorkerPrismaService } from '../database/worker-prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { S3ObjectStoreService } from '../recordings/s3-object-store.service';
import { HttpTranscriptionProvider } from './http-transcription.provider';
import type { TranscriptionProvider } from './transcription.types';

@Injectable()
export class TranscriptionWorker {
  private readonly logger = new Logger(TranscriptionWorker.name);
  private readonly enabled: boolean;
  private running = false;

  constructor(
    private readonly prisma: WorkerPrismaService,
    private readonly config: ConfigService,
    private readonly objectStore: S3ObjectStoreService,
    private readonly httpProvider: HttpTranscriptionProvider,
    private readonly outbox: OutboxService,
  ) {
    this.enabled = config.get<boolean>('STT_ENABLED', false);
  }

  @Interval(3000)
  async runCycle(): Promise<void> {
    if (!this.enabled || this.running) return;
    this.running = true;
    try {
      const pending = await this.prisma.transcript.findMany({
        where: {
          status: ArtifactStatus.PENDING,
          recording: {
            is: {
              status: ArtifactStatus.READY,
              objectKey: { not: null },
            },
          },
        },
        include: { recording: true },
        orderBy: { createdAt: 'asc' },
        take: this.config.get<number>('STT_WORKER_BATCH_SIZE', 2),
      });

      for (const transcript of pending) {
        await this.processTranscript(transcript.id);
      }
    } catch (error: unknown) {
      this.logger.error(
        'Transcription worker cycle failed',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
  }

  private async processTranscript(transcriptId: string): Promise<void> {
    const claimed = await this.prisma.transcript.updateMany({
      where: { id: transcriptId, status: ArtifactStatus.PENDING },
      data: {
        status: ArtifactStatus.PROCESSING,
        provider: this.provider().name,
        failureCode: null,
        version: { increment: 1 },
      },
    });
    if (claimed.count === 0) return;

    const transcript = await this.prisma.transcript.findUnique({
      where: { id: transcriptId },
      include: { recording: true },
    });
    if (!transcript) return;

    const recording = transcript.recording;
    if (
      !recording ||
      recording.status !== ArtifactStatus.READY ||
      !recording.objectKey
    ) {
      await this.fail(transcriptId, 'recording_not_ready');
      return;
    }

    try {
      const media = await this.objectStore.downloadObject(recording.objectKey);
      const result = await this.provider().transcribe({
        audio: media,
        filename: `session-${transcript.sessionId}.mp4`,
        mimeType: recording.mimeType || 'video/mp4',
        ...(transcript.language ? { language: transcript.language } : {}),
      });

      await this.prisma.$transaction(async (transaction) => {
        await transaction.transcriptSegment.deleteMany({
          where: { transcriptId: transcript.id },
        });
        if (result.segments.length > 0) {
          await transaction.transcriptSegment.createMany({
            data: result.segments.map((segment, position) => ({
              organizationId: transcript.organizationId,
              workspaceId: transcript.workspaceId,
              transcriptId: transcript.id,
              position,
              startMs: segment.startMs,
              endMs: segment.endMs,
              speakerLabel: segment.speakerLabel,
              text: segment.text,
            })),
          });
        }
        await transaction.transcript.update({
          where: { id: transcript.id },
          data: {
            status: ArtifactStatus.READY,
            provider: result.provider,
            language: result.language || transcript.language,
            fullText: result.text,
            completedAt: new Date(),
            failureCode: null,
            version: { increment: 1 },
          },
        });
        await this.outbox.enqueue(
          transaction,
          {
            organizationId: transcript.organizationId,
            workspaceId: transcript.workspaceId,
          },
          {
            aggregateType: 'transcript',
            aggregateId: transcript.id,
            eventType: 'transcript.ready',
            payload: {
              transcriptId: transcript.id,
              sessionId: transcript.sessionId,
              provider: result.provider,
              segmentCount: result.segments.length,
            },
          },
        );
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'unknown transcription error';
      this.logger.warn(
        `Transcription failed for ${transcript.id}: ${message}`,
      );
      await this.fail(transcript.id, `stt_failed:${message}`);
    }
  }

  private provider(): TranscriptionProvider {
    const provider = this.config.get<string>('STT_PROVIDER', 'http');
    if (provider === 'http') return this.httpProvider;
    throw new Error(`Unsupported STT provider: ${provider}`);
  }

  private async fail(transcriptId: string, reason: string): Promise<void> {
    await this.prisma.transcript.update({
      where: { id: transcriptId },
      data: {
        status: ArtifactStatus.FAILED,
        failureCode: reason.slice(0, 160),
        completedAt: null,
        version: { increment: 1 },
      },
    });
  }
}
