import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { ArtifactStatus } from '@prisma/client';
import { WorkerPrismaService } from '../database/worker-prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { S3ObjectStoreService } from '../recordings/s3-object-store.service';
import { OpenAiCompatibleTranscriptionProvider } from './openai-compatible-transcription.provider';
import type { TranscriptionProvider } from './transcription-provider';

@Injectable()
export class TranscriptionWorker {
  private readonly logger = new Logger(TranscriptionWorker.name);
  private readonly enabled: boolean;
  private running = false;

  constructor(
    private readonly prisma: WorkerPrismaService,
    private readonly config: ConfigService,
    private readonly objectStore: S3ObjectStoreService,
    private readonly provider: OpenAiCompatibleTranscriptionProvider,
    private readonly outbox: OutboxService,
  ) {
    this.enabled = config.get<boolean>('TRANSCRIPTION_WORKER_ENABLED', false);
  }

  @Interval(3000)
  async runCycle(): Promise<void> {
    if (!this.enabled || this.running) return;
    this.running = true;
    try {
      await this.recoverStaleClaims();
      await this.processPending();
    } catch (error: unknown) {
      this.logger.error(
        'Transcription worker cycle failed',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
  }

  private activeProvider(): TranscriptionProvider {
    const provider = this.config.get<string>('STT_PROVIDER', 'openai-compatible');
    if (provider !== 'openai-compatible') {
      throw new Error(`Unsupported STT_PROVIDER: ${provider}`);
    }
    return this.provider;
  }

  private async processPending(): Promise<void> {
    const transcripts = await this.prisma.transcript.findMany({
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
      take: 3,
    });

    for (const transcript of transcripts) {
      const claimed = await this.prisma.transcript.updateMany({
        where: { id: transcript.id, status: ArtifactStatus.PENDING },
        data: {
          status: ArtifactStatus.PROCESSING,
          failureCode: null,
          version: { increment: 1 },
        },
      });
      if (claimed.count === 0) continue;

      try {
        const recording = transcript.recording;
        if (!recording?.objectKey) {
          throw new Error('Recording object is not available');
        }

        const maxBytes = this.config.get<number>(
          'TRANSCRIPTION_MAX_SOURCE_BYTES',
          250_000_000,
        );
        const source = await this.objectStore.downloadObject(
          recording.objectKey,
          maxBytes,
        );
        const result = await this.activeProvider().transcribe({
          bytes: source,
          filename: `session-${transcript.sessionId}.mp4`,
          mimeType: recording.mimeType ?? 'video/mp4',
          languageHint: transcript.language,
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
                speakerLabel: segment.speakerLabel ?? null,
                text: segment.text,
              })),
            });
          }
          await transaction.transcript.update({
            where: { id: transcript.id },
            data: {
              status: ArtifactStatus.READY,
              provider: result.provider,
              language: result.language ?? null,
              fullText: result.fullText,
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
                language: result.language ?? null,
                segmentCount: result.segments.length,
              },
            },
          );
        });
      } catch (error: unknown) {
        const message = this.message(error);
        await this.prisma.transcript.update({
          where: { id: transcript.id },
          data: {
            status: ArtifactStatus.FAILED,
            failureCode: `stt_failed:${message}`.slice(0, 160),
            version: { increment: 1 },
          },
        });
        this.logger.warn(
          `Transcription ${transcript.id} failed: ${message}`,
        );
      }
    }
  }

  private async recoverStaleClaims(): Promise<void> {
    const staleBefore = new Date(Date.now() - 15 * 60 * 1000);
    await this.prisma.transcript.updateMany({
      where: {
        status: ArtifactStatus.PROCESSING,
        completedAt: null,
        updatedAt: { lt: staleBefore },
      },
      data: {
        status: ArtifactStatus.PENDING,
        failureCode: 'worker_claim_recovered',
        version: { increment: 1 },
      },
    });
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message.slice(0, 500) : 'unknown error';
  }
}
