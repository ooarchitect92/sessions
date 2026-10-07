import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { ArtifactStatus, type Prisma } from '@prisma/client';
import { WorkerPrismaService } from '../database/worker-prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { HttpAiProvider } from './http-ai.provider';
import type { MeetingAiProvider } from './ai.types';

@Injectable()
export class SummaryWorker {
  private readonly logger = new Logger(SummaryWorker.name);
  private readonly enabled: boolean;
  private running = false;

  constructor(
    private readonly prisma: WorkerPrismaService,
    private readonly config: ConfigService,
    private readonly httpProvider: HttpAiProvider,
    private readonly outbox: OutboxService,
  ) {
    this.enabled = config.get<boolean>('AI_ENABLED', false);
  }

  @Interval(4000)
  async runCycle(): Promise<void> {
    if (!this.enabled || this.running) return;
    this.running = true;
    try {
      const pending = await this.prisma.memorySummary.findMany({
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
        orderBy: { createdAt: 'asc' },
        take: this.config.get<number>('AI_WORKER_BATCH_SIZE', 2),
      });

      for (const summary of pending) {
        await this.processSummary(summary.id);
      }
    } catch (error: unknown) {
      this.logger.error(
        'AI summary worker cycle failed',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
  }

  private async processSummary(summaryId: string): Promise<void> {
    const provider = this.provider();
    const claimed = await this.prisma.memorySummary.updateMany({
      where: { id: summaryId, status: ArtifactStatus.PENDING },
      data: {
        status: ArtifactStatus.PROCESSING,
        provider: provider.name,
        model: this.config.get<string>('AI_MODEL', 'default'),
        failureCode: null,
        version: { increment: 1 },
      },
    });
    if (claimed.count === 0) return;

    const summary = await this.prisma.memorySummary.findUnique({
      where: { id: summaryId },
      include: {
        session: {
          include: {
            transcript: {
              include: { segments: { orderBy: { position: 'asc' } } },
            },
            agendaItems: { orderBy: { position: 'asc' } },
          },
        },
      },
    });
    if (!summary) return;

    const transcript = summary.session.transcript;
    if (
      !transcript ||
      transcript.status !== ArtifactStatus.READY ||
      !transcript.fullText
    ) {
      await this.fail(summaryId, 'transcript_not_ready');
      return;
    }

    try {
      const result = await provider.summarize({
        title: summary.session.title,
        ...(summary.session.description
          ? { description: summary.session.description }
          : {}),
        transcript: transcript.fullText,
        segments: transcript.segments.map((segment) => ({
          position: segment.position,
          startMs: segment.startMs,
          endMs: segment.endMs,
          ...(segment.speakerLabel
            ? { speakerLabel: segment.speakerLabel }
            : {}),
          text: segment.text,
        })),
        agenda: summary.session.agendaItems.map((item) => ({
          position: item.position,
          title: item.title,
        })),
      });

      await this.prisma.$transaction(async (transaction) => {
        await transaction.memorySummary.update({
          where: { id: summary.id },
          data: {
            status: ArtifactStatus.READY,
            provider: result.provider,
            model: result.model,
            summaryText: result.summary,
            decisions: result.decisions as unknown as Prisma.InputJsonValue,
            actionItems:
              result.actionItems as unknown as Prisma.InputJsonValue,
            citations: result.citations as unknown as Prisma.InputJsonValue,
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
              model: result.model,
              decisionCount: result.decisions.length,
              actionItemCount: result.actionItems.length,
            },
          },
        );
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'unknown AI summary error';
      this.logger.warn(
        `AI summary failed for ${summary.id}: ${message}`,
      );
      await this.fail(summary.id, `ai_failed:${message}`);
    }
  }

  private provider(): MeetingAiProvider {
    const provider = this.config.get<string>('AI_PROVIDER', 'http');
    if (provider === 'http') return this.httpProvider;
    throw new Error(`Unsupported AI provider: ${provider}`);
  }

  private async fail(summaryId: string, reason: string): Promise<void> {
    await this.prisma.memorySummary.update({
      where: { id: summaryId },
      data: {
        status: ArtifactStatus.FAILED,
        failureCode: reason.slice(0, 160),
        completedAt: null,
        version: { increment: 1 },
      },
    });
  }
}
