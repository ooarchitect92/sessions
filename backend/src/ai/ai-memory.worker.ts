import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { ArtifactStatus } from '@prisma/client';
import { WorkerPrismaService } from '../database/worker-prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { OpenAiCompatibleMemoryProvider } from './openai-compatible-memory.provider';
import type { MemoryGenerationProvider } from './memory-generation-provider';

@Injectable()
export class AiMemoryWorker {
  private readonly logger = new Logger(AiMemoryWorker.name);
  private readonly enabled: boolean;
  private running = false;

  constructor(
    private readonly prisma: WorkerPrismaService,
    private readonly config: ConfigService,
    private readonly provider: OpenAiCompatibleMemoryProvider,
    private readonly outbox: OutboxService,
  ) {
    this.enabled = config.get<boolean>('AI_WORKER_ENABLED', false);
  }

  @Interval(3500)
  async runCycle(): Promise<void> {
    if (!this.enabled || this.running) return;
    this.running = true;
    try {
      await this.recoverStaleClaims();
      await this.processPending();
    } catch (error: unknown) {
      this.logger.error(
        'AI memory worker cycle failed',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
  }

  private activeProvider(): MemoryGenerationProvider {
    const provider = this.config.get<string>('AI_PROVIDER', 'openai-compatible');
    if (provider !== 'openai-compatible') {
      throw new Error(`Unsupported AI_PROVIDER: ${provider}`);
    }
    return this.provider;
  }

  private async processPending(): Promise<void> {
    const items = await this.prisma.memorySummary.findMany({
      where: {
        status: ArtifactStatus.PENDING,
        session: {
          is: {
            transcript: {
              is: {
                status: ArtifactStatus.READY,
                fullText: { not: null },
              },
            },
          },
        },
      },
      include: {
        session: {
          include: {
            transcript: {
              include: {
                segments: { orderBy: { position: 'asc' } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 3,
    });

    for (const item of items) {
      const claimed = await this.prisma.memorySummary.updateMany({
        where: { id: item.id, status: ArtifactStatus.PENDING },
        data: {
          status: ArtifactStatus.PROCESSING,
          failureCode: null,
          version: { increment: 1 },
        },
      });
      if (claimed.count === 0) continue;

      try {
        const transcript = item.session.transcript;
        if (!transcript?.fullText) {
          throw new Error('Transcript is not ready for AI processing');
        }

        const result = await this.activeProvider().generate({
          sessionTitle: item.session.title,
          transcriptText: transcript.fullText,
          transcriptSegments: transcript.segments.map((segment) => ({
            position: segment.position,
            startMs: segment.startMs,
            endMs: segment.endMs,
            speakerLabel: segment.speakerLabel,
            text: segment.text,
          })),
        });

        await this.prisma.$transaction(async (transaction) => {
          await transaction.memorySummary.update({
            where: { id: item.id },
            data: {
              status: ArtifactStatus.READY,
              provider: result.provider,
              model: result.model,
              summaryText: result.summaryText,
              decisions: result.decisions,
              actionItems: result.actionItems,
              citations: result.citations,
              completedAt: new Date(),
              failureCode: null,
              version: { increment: 1 },
            },
          });
          await this.outbox.enqueue(
            transaction,
            {
              organizationId: item.organizationId,
              workspaceId: item.workspaceId,
            },
            {
              aggregateType: 'memory_summary',
              aggregateId: item.id,
              eventType: 'memory.summary.ready',
              payload: {
                memorySummaryId: item.id,
                sessionId: item.sessionId,
                provider: result.provider,
                model: result.model,
                decisionCount: result.decisions.length,
                actionItemCount: result.actionItems.length,
              },
            },
          );
        });
      } catch (error: unknown) {
        const message = this.message(error);
        await this.prisma.memorySummary.update({
          where: { id: item.id },
          data: {
            status: ArtifactStatus.FAILED,
            failureCode: `ai_failed:${message}`.slice(0, 160),
            version: { increment: 1 },
          },
        });
        this.logger.warn(`AI memory ${item.id} failed: ${message}`);
      }
    }
  }

  private async recoverStaleClaims(): Promise<void> {
    const staleBefore = new Date(Date.now() - 15 * 60 * 1000);
    await this.prisma.memorySummary.updateMany({
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
