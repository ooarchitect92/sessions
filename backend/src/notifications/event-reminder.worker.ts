import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import {
  EventReminderKind,
  EventStatus,
  NotificationStatus,
  Prisma,
  RegistrationStatus,
} from '@prisma/client';
import { WorkerPrismaService } from '../database/worker-prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { EmailDeliveryProvider } from './email-delivery.provider';
import { renderEventReminderTemplate } from './event-reminder-template';
import { renderBrandedEmailHtml, workspaceEmailBrand } from './branded-email.renderer';

const EVENT_REMINDERS = [
  {
    kind: EventReminderKind.EVENT_REMINDER_24H,
    offsetMs: 24 * 60 * 60 * 1000,
  },
  {
    kind: EventReminderKind.EVENT_REMINDER_1H,
    offsetMs: 60 * 60 * 1000,
  },
] as const;

@Injectable()
export class EventReminderWorker {
  private readonly logger = new Logger(EventReminderWorker.name);
  private running = false;

  constructor(
    private readonly prisma: WorkerPrismaService,
    private readonly provider: EmailDeliveryProvider,
    private readonly outbox: OutboxService,
    private readonly config: ConfigService,
  ) {}

  @Interval(30_000)
  async runCycle(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.reconcile();
      await this.materialize();
      await this.deliver();
    } catch (error: unknown) {
      this.logger.error(
        'Event reminder cycle failed',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
  }

  private async materialize(): Promise<void> {
    const now = new Date();
    const horizon = new Date(now.getTime() + 26 * 60 * 60 * 1000);
    const templates = await this.prisma.eventNotificationTemplate.findMany({
      where: {
        enabled: true,
        event: {
          status: EventStatus.PUBLISHED,
          startsAt: { gt: now, lte: horizon },
        },
      },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            startsAt: true,
            timezone: true,
            registrations: {
              where: { status: RegistrationStatus.REGISTERED },
              select: {
                id: true,
                name: true,
                email: true,
                registeredAt: true,
              },
              take: 5000,
              orderBy: { registeredAt: 'asc' },
            },
          },
        },
      },
      take: 200,
      orderBy: { updatedAt: 'asc' },
    });

    for (const template of templates) {
      const definition = EVENT_REMINDERS.find(
        (item) => item.kind === template.kind,
      );
      if (!definition) continue;

      const scheduledFor = new Date(
        template.event.startsAt.getTime() - definition.offsetMs,
      );
      const effectiveAttemptAt = scheduledFor > now ? scheduledFor : now;
      const eventTime = this.formatEventTime(
        template.event.startsAt,
        template.event.timezone,
      );

      for (const registration of template.event.registrations) {
        if (scheduledFor <= registration.registeredAt) continue;

        const variables = {
          event_title: template.event.title,
          attendee_name: registration.name,
          event_time: eventTime,
          event_timezone: template.event.timezone,
        };
        const subject = renderEventReminderTemplate(
          template.subject,
          variables,
        ).slice(0, 240);
        const bodyText = renderEventReminderTemplate(
          template.bodyText,
          variables,
        );

        const existing =
          await this.prisma.eventNotificationDelivery.findUnique({
            where: {
              eventRegistrationId_kind_scheduledFor: {
                eventRegistrationId: registration.id,
                kind: template.kind,
                scheduledFor,
              },
            },
          });

        if (!existing) {
          await this.prisma.eventNotificationDelivery.create({
            data: {
              organizationId: template.organizationId,
              workspaceId: template.workspaceId,
              eventRegistrationId: registration.id,
              kind: template.kind,
              recipientEmail: registration.email,
              scheduledFor,
              templateVersion: template.version,
              subject,
              bodyText,
              nextAttemptAt: effectiveAttemptAt,
            },
          });
          continue;
        }

        if (
          existing.templateVersion !== template.version &&
          (existing.status === NotificationStatus.PENDING ||
            existing.status === NotificationStatus.FAILED ||
            existing.status === NotificationStatus.CANCELLED)
        ) {
          await this.prisma.eventNotificationDelivery.update({
            where: { id: existing.id },
            data: {
              recipientEmail: registration.email,
              templateVersion: template.version,
              subject,
              bodyText,
              nextAttemptAt: effectiveAttemptAt,
              lastError: null,
              status: NotificationStatus.PENDING,
            },
          });
        }
      }
    }
  }

  private async reconcile(): Promise<void> {
    const now = new Date();
    const staleSendingBefore = new Date(now.getTime() - 10 * 60 * 1000);

    await this.prisma.eventNotificationDelivery.updateMany({
      where: {
        status: NotificationStatus.SENDING,
        updatedAt: { lt: staleSendingBefore },
      },
      data: {
        status: NotificationStatus.FAILED,
        nextAttemptAt: now,
        lastError: 'stale_sending_claim_recovered',
      },
    });

    const active = await this.prisma.eventNotificationDelivery.findMany({
      where: {
        status: {
          in: [
            NotificationStatus.PENDING,
            NotificationStatus.FAILED,
            NotificationStatus.SENDING,
          ],
        },
      },
      include: {
        eventRegistration: {
          include: {
            event: {
              include: {
                notificationTemplates: true,
              },
            },
          },
        },
      },
      take: 1000,
    });

    for (const delivery of active) {
      const registration = delivery.eventRegistration;
      const event = registration.event;
      const definition = EVENT_REMINDERS.find(
        (item) => item.kind === delivery.kind,
      );
      const template = event.notificationTemplates.find(
        (item) => item.kind === delivery.kind,
      );

      if (!definition || !template) {
        await this.cancelDelivery(delivery.id, 'template_missing');
        continue;
      }

      const expected = new Date(
        event.startsAt.getTime() - definition.offsetMs,
      );
      let reason: string | null = null;

      if (registration.status !== RegistrationStatus.REGISTERED) {
        reason = 'registration_no_longer_registered';
      } else if (event.status !== EventStatus.PUBLISHED) {
        reason = 'event_not_published';
      } else if (!template.enabled) {
        reason = 'template_disabled';
      } else if (expected.getTime() !== delivery.scheduledFor.getTime()) {
        reason = 'event_rescheduled';
      } else if (event.startsAt <= now) {
        reason = 'event_already_started';
      }

      if (reason) {
        await this.cancelDelivery(delivery.id, reason);
      }
    }
  }

  private async cancelDelivery(id: string, reason: string): Promise<void> {
    await this.prisma.eventNotificationDelivery.updateMany({
      where: {
        id,
        status: {
          in: [
            NotificationStatus.PENDING,
            NotificationStatus.FAILED,
            NotificationStatus.SENDING,
          ],
        },
      },
      data: {
        status: NotificationStatus.CANCELLED,
        nextAttemptAt: null,
        lastError: reason,
      },
    });
  }

  private async deliver(): Promise<void> {
    const now = new Date();
    const deliveries = await this.prisma.eventNotificationDelivery.findMany({
      where: {
        OR: [
          {
            status: NotificationStatus.PENDING,
            scheduledFor: { lte: now },
            OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
          },
          {
            status: NotificationStatus.FAILED,
            nextAttemptAt: { lte: now },
          },
        ],
      },
      include: {
        eventRegistration: {
          include: {
            event: {
              include: {
                notificationTemplates: true,
              },
            },
          },
        },
      },
      orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'asc' }],
      take: 20,
    });

    for (const delivery of deliveries) {
      const claimed = await this.prisma.eventNotificationDelivery.updateMany({
        where: {
          id: delivery.id,
          status: {
            in: [NotificationStatus.PENDING, NotificationStatus.FAILED],
          },
        },
        data: { status: NotificationStatus.SENDING },
      });
      if (claimed.count === 0) continue;

      const registration = delivery.eventRegistration;
      const event = registration.event;
      const template = event.notificationTemplates.find(
        (item) => item.kind === delivery.kind,
      );
      const eligible =
        registration.status === RegistrationStatus.REGISTERED &&
        event.status === EventStatus.PUBLISHED &&
        event.startsAt > now &&
        template?.enabled === true;

      if (!eligible) {
        await this.cancelDelivery(
          delivery.id,
          'event_or_registration_not_eligible_at_delivery_time',
        );
        continue;
      }

      try {
        const workspace = await this.prisma.workspace.findUnique({
          where: { id: delivery.workspaceId },
          select: { name: true, settings: true },
        });
        const result = await this.provider.send({
          to: delivery.recipientEmail,
          subject: delivery.subject,
          text: delivery.bodyText,
          html: renderBrandedEmailHtml({
            brand: workspaceEmailBrand(workspace),
            heading: event.title,
            text: delivery.bodyText,
          }),
          idempotencyKey: `event-reminder:${delivery.id}`,
        });

        await this.prisma.$transaction(async (transaction) => {
          const updated = await transaction.eventNotificationDelivery.update({
            where: { id: delivery.id },
            data: {
              status: NotificationStatus.DELIVERED,
              attempts: { increment: 1 },
              nextAttemptAt: null,
              provider: result.provider,
              providerMessageId: result.messageId,
              lastError: null,
              deliveredAt: new Date(),
            },
          });

          await this.outbox.enqueue(
            transaction,
            {
              organizationId: updated.organizationId,
              workspaceId: updated.workspaceId,
            },
            {
              aggregateType: 'event_notification_delivery',
              aggregateId: updated.id,
              eventType: 'event.notification.delivered',
              payload: this.json({
                notificationId: updated.id,
                eventId: event.id,
                registrationId: registration.id,
                kind: updated.kind,
                provider: updated.provider,
                deliveredAt: updated.deliveredAt,
              }),
            },
          );
        });
      } catch (error: unknown) {
        await this.handleFailure(delivery.id, error);
      }
    }
  }

  private async handleFailure(
    deliveryId: string,
    error: unknown,
  ): Promise<void> {
    const maxAttempts = this.config.get<number>(
      'NOTIFICATION_MAX_ATTEMPTS',
      5,
    );
    const baseDelaySeconds = this.config.get<number>(
      'NOTIFICATION_RETRY_BASE_SECONDS',
      60,
    );
    const current =
      await this.prisma.eventNotificationDelivery.findUniqueOrThrow({
        where: { id: deliveryId },
      });
    const attempts = current.attempts + 1;
    const terminal = attempts >= maxAttempts;
    const message =
      error instanceof Error ? error.message.slice(0, 500) : 'unknown';

    await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.eventNotificationDelivery.update({
        where: { id: deliveryId },
        data: {
          status: terminal
            ? NotificationStatus.DEAD_LETTER
            : NotificationStatus.FAILED,
          attempts,
          nextAttemptAt: terminal
            ? null
            : new Date(
                Date.now() +
                  Math.min(
                    6 * 60 * 60,
                    baseDelaySeconds * 2 ** Math.max(0, attempts - 1),
                  ) *
                    1000,
              ),
          lastError: message,
        },
      });

      if (terminal) {
        await this.outbox.enqueue(
          transaction,
          {
            organizationId: updated.organizationId,
            workspaceId: updated.workspaceId,
          },
          {
            aggregateType: 'event_notification_delivery',
            aggregateId: updated.id,
            eventType: 'event.notification.dead_lettered',
            payload: this.json({
              notificationId: updated.id,
              kind: updated.kind,
              attempts: updated.attempts,
              error: message,
            }),
          },
        );
      }
    });
  }

  private formatEventTime(startsAt: Date, timezone: string): string {
    return new Intl.DateTimeFormat('en', {
      timeZone: timezone,
      dateStyle: 'full',
      timeStyle: 'short',
    }).format(startsAt);
  }

  private json(value: unknown): Prisma.InputJsonObject {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
  }
}
