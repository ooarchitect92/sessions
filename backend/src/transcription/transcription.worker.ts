import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { ArtifactStatus, Prisma, SessionStatus } from '@prisma/client';
import { WorkerPrismaService } from '../database/worker-prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { S3ObjectStoreService } from '../recordings/s3-object-store.service';
import { DiarizationProviderService } from './diarization-provider.service';
import { MediaNormalizationService } from './media-normalization.service';
import { TranscriptionProviderService } from './transcription-provider.service';

@Injectable()
export class TranscriptionWorker {
  private readonly logger = new Logger(TranscriptionWorker.name);
  private running = false;

  constructor(
    private readonly prisma: WorkerPrismaService,
    private readonly config: ConfigService,
    private readonly outbox: OutboxService,
    private readonly objectStore: S3ObjectStoreService,
    private readonly provider: TranscriptionProviderService,
    private readonly normalizer: MediaNormalizationService,
    private readonly diarization: DiarizationProviderService,
  ) {}

  @Interval(2500)
  async runCycle(): Promise<void> {
    if (!this.provider.isEnabled() || this.running) return;
    this.running = true;
    try {
      await this.processReadyRecordings();
      await this.failUnavailableSources();
    } catch (error: unknown) {
      this.logger.error(
        'Transcription worker cycle failed',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
  }

  private async processReadyRecordings(): Promise<void> {
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
      take: 5,
    });

    for (const transcript of transcripts) {
      if (!transcript.recording?.objectKey) continue;

      const claimed = await this.prisma.transcript.updateMany({
        where: { id: transcript.id, status: ArtifactStatus.PENDING },
        data: {
          status: ArtifactStatus.PROCESSING,
          provider: this.provider.providerName(),
          failureCode: null,
          completedAt: null,
          version: { increment: 1 },
        },
      });
      if (claimed.count === 0) continue;

      try {
        const maxBytes = this.config.get<number>(
          'STT_MAX_MEDIA_BYTES',
          25 * 1024 * 1024,
        );
        const media = await this.objectStore.downloadObject(
          transcript.recording.objectKey,
          maxBytes,
        );
        const mimeType = transcript.recording.mimeType ?? 'video/mp4';
        const normalized = await this.normalizer.normalize({
          media,
          mimeType,
          filename: `session-${transcript.sessionId}.mp4`,
        });
        const transcription = await this.provider.transcribe({
          media: normalized.media,
          mimeType: normalized.mimeType,
          filename: normalized.filename,
          language: transcript.language,
        });
        const result = await this.diarization.diarize({
          media: normalized.media,
          mimeType: normalized.mimeType,
          filename: normalized.filename,
          transcription,
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
                endMs: Math.max(segment.startMs, segment.endMs),
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
              language: result.language ?? transcript.language,
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
                language: result.language ?? transcript.language,
                segmentCount: result.segments.length,
                mediaNormalization: this.normalizer.providerName(),
                diarizationProvider: this.diarization.providerName(),
                speakerLabeledSegmentCount: result.segments.filter(
                  (segment) => Boolean(segment.speakerLabel),
                ).length,
              } as Prisma.InputJsonObject,
            },
          );
        });
      } catch (error: unknown) {
        await this.failTranscript(
          transcript,
          `stt_failed:${this.message(error)}`,
        );
      }
    }
  }

  private async failUnavailableSources(): Promise<void> {
    const stale = await this.prisma.transcript.findMany({
      where: {
        status: ArtifactStatus.PENDING,
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
        OR: [
          { recordingId: null },
          {
            recording: {
              is: {
                status: {
                  in: [
                    ArtifactStatus.FAILED,
                    ArtifactStatus.DELETED,
                  ],
                },
              },
            },
          },
        ],
      },
      take: 20,
    });

    for (const transcript of stale) {
      await this.failTranscript(transcript, 'stt_source_unavailable');
    }
  }

  private async failTranscript(
    transcript: {
      id: string;
      organizationId: string;
      workspaceId: string;
      sessionId: string;
    },
    failureCode: string,
  ): Promise<void> {
    const code = failureCode.slice(0, 160);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.transcript.update({
        where: { id: transcript.id },
        data: {
          status: ArtifactStatus.FAILED,
          failureCode: code,
          completedAt: new Date(),
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
          eventType: 'transcript.failed',
          payload: {
            transcriptId: transcript.id,
            sessionId: transcript.sessionId,
            failureCode: code,
          },
        },
      );
    });
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message.slice(0, 140) : 'unknown';
  }
}
