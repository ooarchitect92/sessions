import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { EmailDeliveryStatus } from '@prisma/client';
import { WorkerPrismaService } from '../database/worker-prisma.service';
import { RealtimeEventsService } from '../infrastructure/realtime-events.service';
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
    private readonly realtime: RealtimeEventsService,
  ) {
    this.enabled = config.get<boolean>('EMAIL_ENABLED', false);
  }

  @Interval(4000)
  async runCycle(): Promise<void> {
    if (!this.enabled || this.running) return;
    this.running = true;
    try {
      const pending = await this.prisma.emailDelivery.findMany({
        where: {
          status: EmailDeliveryStatus.PENDING,
          scheduledFor: { lte: new Date() },
        },
        orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'asc' }],
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
      include: {
        bookingReservation: true,
        eventRegistration: { include: { event: true } },
      },
    });
    if (!delivery) return;

    if (
      delivery.bookingReservation &&
      delivery.bookingReservation.status !== 'CONFIRMED'
    ) {
      await this.fail(delivery.id, 'suppressed:booking_not_confirmed');
      return;
    }
    if (
      delivery.eventRegistration &&
      (delivery.eventRegistration.status !== 'REGISTERED' ||
        delivery.eventRegistration.event.status === 'CANCELLED')
    ) {
      await this.fail(delivery.id, 'suppressed:event_registration_inactive');
      return;
    }

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

      const sent = await this.prisma.$transaction(async (transaction) => {
        const sentRecord = await transaction.emailDelivery.update({
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
            organizationId: sentRecord.organizationId,
            workspaceId: sentRecord.workspaceId,
          },
          {
            aggregateType: 'email_delivery',
            aggregateId: sentRecord.id,
            eventType: 'email.delivery.sent',
            payload: {
              emailDeliveryId: sentRecord.id,
              sessionId: sentRecord.sessionId,
              memorySummaryId: sentRecord.memorySummaryId,
              provider: result.provider,
              providerMessageId: result.messageId ?? null,
            },
          },
        );
        return sentRecord;
      });
      this.realtime.publishSessionEvent({
        sessionId: sent.sessionId,
        eventName: 'email.delivery.sent',
        payload: {
          emailDeliveryId: sent.id,
          status: sent.status,
          sentAt: sent.sentAt?.toISOString(),
        },
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
    const failed = await this.prisma.$transaction(async (transaction) => {
      const failedRecord = await transaction.emailDelivery.update({
        where: { id: deliveryId },
        data: {
          status: EmailDeliveryStatus.FAILED,
          failureCode: reason.slice(0, 320),
        },
      });
      await this.outbox.enqueue(
        transaction,
        {
          organizationId: failedRecord.organizationId,
          workspaceId: failedRecord.workspaceId,
        },
        {
          aggregateType: 'email_delivery',
          aggregateId: failedRecord.id,
          eventType: 'email.delivery.failed',
          payload: {
            emailDeliveryId: failedRecord.id,
            sessionId: failedRecord.sessionId,
            memorySummaryId: failedRecord.memorySummaryId,
            failureCode: failedRecord.failureCode,
          },
        },
      );
      return failedRecord;
    });
    this.realtime.publishSessionEvent({
      sessionId: failed.sessionId,
      eventName: 'email.delivery.failed',
      payload: {
        emailDeliveryId: failed.id,
        status: failed.status,
        failureCode: failed.failureCode,
      },
    });
  }
}
