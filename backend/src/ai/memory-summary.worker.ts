import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ArtifactStatus, Prisma } from '@prisma/client';
import { WorkerPrismaService } from '../database/worker-prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { AiProviderService } from './ai-provider.service';

@Injectable()
export class MemorySummaryWorker {
  private readonly logger = new Logger(MemorySummaryWorker.name);
  private running = false;

  constructor(
    private readonly prisma: WorkerPrismaService,
    private readonly outbox: OutboxService,
    private readonly provider: AiProviderService,
  ) {}

  @Interval(3000)
  async runCycle(): Promise<void> {
    if (!this.provider.isEnabled() || this.running) return;
    this.running = true;
    try {
      await this.processReadyTranscripts();
      await this.failUnavailableTranscripts();
    } catch (error: unknown) {
      this.logger.error(
        'Memory summary worker cycle failed',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
  }

  private async processReadyTranscripts(): Promise<void> {
    const summaries = await this.prisma.memorySummary.findMany({
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
          include: { transcript: true },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 5,
    });

    for (const summary of summaries) {
      const transcript = summary.session.transcript;
      if (!transcript?.fullText) continue;

      const claimed = await this.prisma.memorySummary.updateMany({
        where: { id: summary.id, status: ArtifactStatus.PENDING },
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
        const result = await this.provider.summarize({
          title: summary.session.title,
          transcript: transcript.fullText,
        });

        await this.prisma.$transaction(async (transaction) => {
          await transaction.memorySummary.update({
            where: { id: summary.id },
            data: {
              status: ArtifactStatus.READY,
              provider: result.provider,
              model: result.model ?? null,
              summaryText: result.summaryText,
              decisions: result.decisions as Prisma.InputJsonValue,
              actionItems: result.actionItems as Prisma.InputJsonValue,
              citations: result.citations as Prisma.InputJsonValue,
              completedAt: new Date(),
              failureCode: null,
              version: { increment: 1 },
            },
          });
          await this.outbox.enqueue(
            transaction,
            {
              organizationId: summary.organizationId,
              workspaceId: summary.workspaceId,
            },
            {
              aggregateType: 'memory_summary',
              aggregateId: summary.id,
              eventType: 'memory.summary.ready',
              payload: {
                memorySummaryId: summary.id,
                sessionId: summary.sessionId,
                provider: result.provider,
                model: result.model ?? null,
              },
            },
          );
        });
      } catch (error: unknown) {
        await this.failSummary(summary, `ai_failed:${this.message(error)}`);
      }
    }
  }

  private async failUnavailableTranscripts(): Promise<void> {
    const summaries = await this.prisma.memorySummary.findMany({
      where: {
        status: ArtifactStatus.PENDING,
        session: {
          is: {
            transcript: {
              is: {
                status: {
                  in: [ArtifactStatus.FAILED, ArtifactStatus.DELETED],
                },
              },
            },
          },
        },
      },
      take: 20,
    });

    for (const summary of summaries) {
      await this.failSummary(summary, 'ai_transcript_unavailable');
    }
  }

  private async failSummary(
    summary: {
      id: string;
      organizationId: string;
      workspaceId: string;
      sessionId: string;
    },
    failureCode: string,
  ): Promise<void> {
    const code = failureCode.slice(0, 160);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.memorySummary.update({
        where: { id: summary.id },
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
          organizationId: summary.organizationId,
          workspaceId: summary.workspaceId,
        },
        {
          aggregateType: 'memory_summary',
          aggregateId: summary.id,
          eventType: 'memory.summary.failed',
          payload: {
            memorySummaryId: summary.id,
            sessionId: summary.sessionId,
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
