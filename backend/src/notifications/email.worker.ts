import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { EmailDeliveryStatus } from '@prisma/client';
import { WorkerPrismaService } from '../database/worker-prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { HttpEmailProvider } from './http-email.provider';
import type { EmailProvider } from './email.types';

@Injectable()
export class EmailWorker {
  private readonly logger = new Logger(EmailWorker.name);
  private readonly enabled: boolean;
  private running = false;

  constructor(
    private readonly prisma: WorkerPrismaService,
    private readonly config: ConfigService,
    private readonly httpProvider: HttpEmailProvider,
    private readonly outbox: OutboxService,
  ) {
    this.enabled = config.get<boolean>('EMAIL_ENABLED', false);
  }

  @Interval(4000)
  async runCycle(): Promise<void> {
    if (!this.enabled || this.running) return;
    this.running = true;
    try {
      const pending = await this.prisma.emailDelivery.findMany({
        where: { status: EmailDeliveryStatus.PENDING },
        orderBy: { createdAt: 'asc' },
        take: this.config.get<number>('EMAIL_WORKER_BATCH_SIZE', 5),
      });

      for (const delivery of pending) {
        await this.process(delivery.id);
      }
    } catch (error: unknown) {
      this.logger.error(
        'Email worker cycle failed',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
  }

  private async process(deliveryId: string): Promise<void> {
    const provider = this.provider();
    const claimed = await this.prisma.emailDelivery.updateMany({
      where: {
        id: deliveryId,
        status: EmailDeliveryStatus.PENDING,
      },
      data: {
        status: EmailDeliveryStatus.PROCESSING,
        provider: provider.name,
        attempts: { increment: 1 },
        failureCode: null,
      },
    });
    if (claimed.count === 0) return;

    const delivery = await this.prisma.emailDelivery.findUnique({
      where: { id: deliveryId },
    });
    if (!delivery) return;

    const recipients = Array.isArray(delivery.recipients)
      ? delivery.recipients.filter(
          (value): value is string => typeof value === 'string',
        )
      : [];

    if (recipients.length === 0) {
      await this.fail(delivery.id, 'no_recipients');
      return;
    }

    try {
      const result = await provider.send({
        from: this.config.getOrThrow<string>('EMAIL_FROM_ADDRESS'),
        to: recipients,
        subject: delivery.subject,
        text: delivery.body,
      });

      await this.prisma.$transaction(async (transaction) => {
        const sent = await transaction.emailDelivery.update({
          where: { id: delivery.id },
          data: {
            status: EmailDeliveryStatus.SENT,
            provider: result.provider,
            providerMessageId: result.messageId ?? null,
            sentAt: new Date(),
            failureCode: null,
          },
        });
        await this.outbox.enqueue(
          transaction,
          {
            organizationId: sent.organizationId,
            workspaceId: sent.workspaceId,
          },
          {
            aggregateType: 'email_delivery',
            aggregateId: sent.id,
            eventType: 'email.delivery.sent',
            payload: {
              emailDeliveryId: sent.id,
              sessionId: sent.sessionId,
              memorySummaryId: sent.memorySummaryId,
              provider: result.provider,
              providerMessageId: result.messageId ?? null,
            },
          },
        );
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'unknown email provider error';
      this.logger.warn(`Email delivery failed for ${delivery.id}: ${message}`);
      await this.fail(delivery.id, `email_failed:${message}`);
    }
  }

  private provider(): EmailProvider {
    const provider = this.config.get<string>('EMAIL_PROVIDER', 'http');
    if (provider === 'http') return this.httpProvider;
    throw new Error(`Unsupported email provider: ${provider}`);
  }

  private async fail(deliveryId: string, reason: string): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const failed = await transaction.emailDelivery.update({
        where: { id: deliveryId },
        data: {
          status: EmailDeliveryStatus.FAILED,
          failureCode: reason.slice(0, 320),
        },
      });
      await this.outbox.enqueue(
        transaction,
        {
          organizationId: failed.organizationId,
          workspaceId: failed.workspaceId,
        },
        {
          aggregateType: 'email_delivery',
          aggregateId: failed.id,
          eventType: 'email.delivery.failed',
          payload: {
            emailDeliveryId: failed.id,
            sessionId: failed.sessionId,
            memorySummaryId: failed.memorySummaryId,
            failureCode: failed.failureCode,
          },
        },
      );
    });
  }
}
