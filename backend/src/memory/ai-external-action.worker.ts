import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import {
  AiExternalActionKind,
  AiExternalActionStatus,
  ArtifactStatus,
  Prisma,
} from '@prisma/client';
import { BILLING_METRICS } from '../billing/billing-plans';
import { BillingService } from '../billing/billing.service';
import { WorkerPrismaService } from '../database/worker-prisma.service';
import { EmailDeliveryProvider } from '../notifications/email-delivery.provider';
import { OutboxService } from '../outbox/outbox.service';
import { CrmWriteProvider } from './crm-write.provider';

@Injectable()
export class AiExternalActionWorker {
  private readonly logger = new Logger(AiExternalActionWorker.name);
  private running = false;

  constructor(
    private readonly prisma: WorkerPrismaService,
    private readonly email: EmailDeliveryProvider,
    private readonly crm: CrmWriteProvider,
    private readonly billing: BillingService,
    private readonly outbox: OutboxService,
  ) {}

  @Interval(2500)
  async runCycle(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const actions = await this.prisma.aiExternalAction.findMany({
        where: { status: AiExternalActionStatus.APPROVED },
        orderBy: { approvedAt: 'asc' },
        take: 10,
      });
      for (const action of actions) {
        await this.execute(action);
      }
    } catch (error: unknown) {
      this.logger.error(
        'AI external action worker cycle failed',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
  }

  private async execute(action: {
    id: string;
    organizationId: string;
    workspaceId: string;
    sessionId: string;
    kind: AiExternalActionKind;
    sourceSummaryVersion: number;
    version: number;
    recipientEmail: string | null;
    subject: string | null;
    bodyText: string;
    targetProvider: string | null;
    targetRecordId: string | null;
  }): Promise<void> {
    const claimed = await this.prisma.aiExternalAction.updateMany({
      where: {
        id: action.id,
        status: AiExternalActionStatus.APPROVED,
      },
      data: {
        status: AiExternalActionStatus.PROCESSING,
        failureCode: null,
        version: { increment: 1 },
      },
    });
    if (claimed.count === 0) return;

    let quotaReservationId: string | null = null;
    try {
      const summary = await this.prisma.memorySummary.findUnique({
        where: { sessionId: action.sessionId },
        select: { version: true, status: true },
      });
      if (
        !summary ||
        summary.status !== ArtifactStatus.READY ||
        summary.version !== action.sourceSummaryVersion
      ) {
        await this.prisma.aiExternalAction.update({
          where: { id: action.id },
          data: {
            status: AiExternalActionStatus.CANCELLED,
            failureCode: 'source_summary_changed',
            version: { increment: 1 },
          },
        });
        return;
      }

      const quotaReservation = await this.billing.reserveQuota({
        organizationId: action.organizationId,
        workspaceId: action.workspaceId,
        metric: BILLING_METRICS.AI_EXTERNAL_ACTIONS,
        quantity: 1n,
        reservationKey: `ai-external-action:${action.id}:version:${action.version}`,
        ttlSeconds: 15 * 60,
      });
      quotaReservationId = quotaReservation.id;

      const idempotencyKey = `ai-external-action:${action.id}`;
      const result =
        action.kind === AiExternalActionKind.EMAIL_FOLLOW_UP
          ? await this.sendEmail(action, idempotencyKey)
          : await this.writeCrmNote(action, idempotencyKey);

      await this.prisma.$transaction(async (transaction) => {
        await transaction.aiExternalAction.update({
          where: { id: action.id },
          data: {
            status: AiExternalActionStatus.SUCCEEDED,
            executionProvider: result.provider,
            providerReferenceId: result.referenceId,
            failureCode: null,
            executedAt: new Date(),
            version: { increment: 1 },
          },
        });
        await this.outbox.enqueue(
          transaction,
          {
            organizationId: action.organizationId,
            workspaceId: action.workspaceId,
          },
          {
            aggregateType: 'ai_external_action',
            aggregateId: action.id,
            eventType: 'ai.external_action.succeeded',
            payload: {
              actionId: action.id,
              sessionId: action.sessionId,
              kind: action.kind,
              executionProvider: result.provider,
            } as Prisma.InputJsonObject,
          },
        );
      });
      try {
        await this.billing.commitReservation(
          quotaReservationId,
          'ai_external_action',
          action.id,
        );
      } catch (usageError: unknown) {
        this.logger.warn(
          `AI external action succeeded but usage accounting failed for ${action.id}: ${usageError instanceof Error ? usageError.message : 'unknown'}`,
        );
      }
    } catch (error: unknown) {
      if (quotaReservationId) {
        await this.billing.releaseReservation(quotaReservationId);
      }
      const failureCode = this.message(error);
      await this.prisma.$transaction(async (transaction) => {
        await transaction.aiExternalAction.update({
          where: { id: action.id },
          data: {
            status: AiExternalActionStatus.FAILED,
            failureCode,
            version: { increment: 1 },
          },
        });
        await this.outbox.enqueue(
          transaction,
          {
            organizationId: action.organizationId,
            workspaceId: action.workspaceId,
          },
          {
            aggregateType: 'ai_external_action',
            aggregateId: action.id,
            eventType: 'ai.external_action.failed',
            payload: {
              actionId: action.id,
              sessionId: action.sessionId,
              kind: action.kind,
              failureCode,
            } as Prisma.InputJsonObject,
          },
        );
      });
    }
  }

  private async sendEmail(
    action: {
      id: string;
      organizationId: string;
      workspaceId: string;
      recipientEmail: string | null;
      subject: string | null;
      bodyText: string;
    },
    idempotencyKey: string,
  ): Promise<{ provider: string; referenceId: string }> {
    if (!action.recipientEmail || !action.subject) {
      throw new Error('followup_email_missing_recipient_or_subject');
    }
    const result = await this.email.send({
      organizationId: action.organizationId,
      workspaceId: action.workspaceId,
      to: action.recipientEmail,
      subject: action.subject,
      text: action.bodyText,
      idempotencyKey,
    });
    return { provider: result.provider, referenceId: result.messageId };
  }

  private async writeCrmNote(
    action: {
      organizationId: string;
      workspaceId: string;
      targetProvider: string | null;
      targetRecordId: string | null;
      bodyText: string;
    },
    idempotencyKey: string,
  ): Promise<{ provider: string; referenceId: string }> {
    if (!action.targetProvider || !action.targetRecordId) {
      throw new Error('crm_note_missing_target');
    }
    return this.crm.writeNote({
      organizationId: action.organizationId,
      workspaceId: action.workspaceId,
      targetProvider: action.targetProvider,
      targetRecordId: action.targetRecordId,
      note: action.bodyText,
      idempotencyKey,
    });
  }

  private message(error: unknown): string {
    return (error instanceof Error ? error.message : 'unknown').slice(0, 500);
  }
}
