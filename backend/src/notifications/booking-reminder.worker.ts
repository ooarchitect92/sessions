import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import {
  BookingStatus,
  NotificationKind,
  NotificationStatus,
  Prisma,
} from '@prisma/client';
import { WorkerPrismaService } from '../database/worker-prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { EmailDeliveryProvider } from './email-delivery.provider';
import { renderWorkspaceEmailTemplate } from './workspace-email-template';
import { renderBrandedEmailHtml, workspaceEmailBrand } from './branded-email.renderer';

const REMINDERS = [
  {
    kind: NotificationKind.BOOKING_REMINDER_24H,
    offsetMs: 24 * 60 * 60 * 1000,
    label: '24 hours',
  },
  {
    kind: NotificationKind.BOOKING_REMINDER_1H,
    offsetMs: 60 * 60 * 1000,
    label: '1 hour',
  },
] as const;

@Injectable()
export class BookingReminderWorker {
  private readonly logger = new Logger(BookingReminderWorker.name);
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
        'Booking reminder cycle failed',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
  }

  private async materialize(): Promise<void> {
    const now = new Date();
    const horizon = new Date(now.getTime() + 26 * 60 * 60 * 1000);
    const reservations = await this.prisma.bookingReservation.findMany({
      where: {
        status: BookingStatus.CONFIRMED,
        startsAt: { gt: now, lte: horizon },
      },
      select: {
        id: true,
        organizationId: true,
        workspaceId: true,
        email: true,
        startsAt: true,
      },
      take: 250,
      orderBy: { startsAt: 'asc' },
    });

    for (const reservation of reservations) {
      for (const reminder of REMINDERS) {
        const scheduledFor = new Date(
          reservation.startsAt.getTime() - reminder.offsetMs,
        );
        await this.prisma.notificationDelivery.upsert({
          where: {
            bookingReservationId_kind_scheduledFor: {
              bookingReservationId: reservation.id,
              kind: reminder.kind,
              scheduledFor,
            },
          },
          update: {},
          create: {
            organizationId: reservation.organizationId,
            workspaceId: reservation.workspaceId,
            bookingReservationId: reservation.id,
            kind: reminder.kind,
            recipientEmail: reservation.email,
            scheduledFor,
            nextAttemptAt: scheduledFor > now ? scheduledFor : now,
          },
        });
      }
    }
  }

  private async reconcile(): Promise<void> {
    const now = new Date();
    const staleSendingBefore = new Date(now.getTime() - 10 * 60 * 1000);

    await this.prisma.notificationDelivery.updateMany({
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

    const pending = await this.prisma.notificationDelivery.findMany({
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
        bookingReservation: {
          select: { status: true, startsAt: true },
        },
      },
      take: 500,
    });

    for (const delivery of pending) {
      const reminder = REMINDERS.find((item) => item.kind === delivery.kind);
      if (!reminder) continue;
      const expected = new Date(
        delivery.bookingReservation.startsAt.getTime() - reminder.offsetMs,
      );
      const invalid =
        delivery.bookingReservation.status !== BookingStatus.CONFIRMED ||
        expected.getTime() !== delivery.scheduledFor.getTime();

      if (invalid) {
        await this.prisma.notificationDelivery.updateMany({
          where: {
            id: delivery.id,
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
            lastError:
              delivery.bookingReservation.status !== BookingStatus.CONFIRMED
                ? 'reservation_no_longer_confirmed'
                : 'reservation_rescheduled',
          },
        });
      }
    }
  }

  private async deliver(): Promise<void> {
    const now = new Date();
    const deliveries = await this.prisma.notificationDelivery.findMany({
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
        bookingReservation: {
          include: {
            bookingPage: { select: { title: true, timezone: true } },
            session: { select: { title: true } },
          },
        },
      },
      orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'asc' }],
      take: 20,
    });

    for (const delivery of deliveries) {
      const claimed = await this.prisma.notificationDelivery.updateMany({
        where: {
          id: delivery.id,
          status: {
            in: [NotificationStatus.PENDING, NotificationStatus.FAILED],
          },
        },
        data: { status: NotificationStatus.SENDING },
      });
      if (claimed.count === 0) continue;

      if (
        delivery.bookingReservation.status !== BookingStatus.CONFIRMED ||
        delivery.bookingReservation.startsAt <= now
      ) {
        await this.prisma.notificationDelivery.update({
          where: { id: delivery.id },
          data: {
            status: NotificationStatus.CANCELLED,
            nextAttemptAt: null,
            lastError: 'reservation_not_eligible_at_delivery_time',
          },
        });
        continue;
      }

      const definition = REMINDERS.find((item) => item.kind === delivery.kind);
      if (!definition) continue;

      try {
        const startsAt = new Intl.DateTimeFormat('en', {
          timeZone: delivery.bookingReservation.bookingPage.timezone,
          dateStyle: 'full',
          timeStyle: 'short',
        }).format(delivery.bookingReservation.startsAt);
        const title =
          delivery.bookingReservation.session?.title ??
          delivery.bookingReservation.bookingPage.title;
        const configured = await this.prisma.$queryRaw<Array<{
          enabled: boolean;
          subject: string;
          body_text: string;
          signature: string;
        }>>`
          SELECT enabled, subject, body_text, signature
          FROM workspace_email_templates
          WHERE workspace_id = ${delivery.workspaceId}::uuid
            AND kind = ${delivery.kind}
          LIMIT 1
        `;
        const template = configured[0];
        if (template && !template.enabled) {
          await this.prisma.notificationDelivery.update({
            where: { id: delivery.id },
            data: {
              status: NotificationStatus.CANCELLED,
              nextAttemptAt: null,
              lastError: 'workspace_template_disabled',
            },
          });
          continue;
        }
        const variables = {
          booking_title: title,
          attendee_name: delivery.bookingReservation.name,
          booking_time: startsAt,
          booking_timezone: delivery.bookingReservation.bookingPage.timezone,
        };
        const fallbackSubject = `Reminder: ${title} starts in ${definition.label}`;
        const fallbackBody = [
          `Your scheduled session "${title}" starts in ${definition.label}.`,
          `Time: ${startsAt} (${delivery.bookingReservation.bookingPage.timezone})`,
          'Open your Sessions booking confirmation to manage or cancel this meeting.',
        ].join('\n\n');
        const subject = template
          ? renderWorkspaceEmailTemplate(template.subject, variables).slice(0, 240)
          : fallbackSubject;
        const body = template
          ? renderWorkspaceEmailTemplate(
              template.body_text + (template.signature.trim() ? '\n\n' + template.signature : ''),
              variables,
            )
          : fallbackBody;
        const workspace = await this.prisma.workspace.findUnique({
          where: { id: delivery.workspaceId },
          select: { name: true, settings: true },
        });
        const result = await this.provider.send({
          to: delivery.recipientEmail,
          subject,
          text: body,
          html: renderBrandedEmailHtml({
            brand: workspaceEmailBrand(workspace),
            heading: title,
            text: body,
          }),
          idempotencyKey: `booking-reminder:${delivery.id}`,
        });

        await this.prisma.$transaction(async (transaction) => {
          const updated = await transaction.notificationDelivery.update({
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
              aggregateType: 'notification_delivery',
              aggregateId: updated.id,
              eventType: 'notification.delivered',
              payload: this.json({
                notificationId: updated.id,
                reservationId: updated.bookingReservationId,
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

  private async handleFailure(deliveryId: string, error: unknown): Promise<void> {
    const maxAttempts = this.config.get<number>(
      'NOTIFICATION_MAX_ATTEMPTS',
      5,
    );
    const baseDelaySeconds = this.config.get<number>(
      'NOTIFICATION_RETRY_BASE_SECONDS',
      60,
    );
    const current = await this.prisma.notificationDelivery.findUniqueOrThrow({
      where: { id: deliveryId },
    });
    const attempts = current.attempts + 1;
    const terminal = attempts >= maxAttempts;
    const message =
      error instanceof Error ? error.message.slice(0, 500) : 'unknown';

    await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.notificationDelivery.update({
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
            aggregateType: 'notification_delivery',
            aggregateId: updated.id,
            eventType: 'notification.dead_lettered',
            payload: this.json({
              notificationId: updated.id,
              reservationId: updated.bookingReservationId,
              kind: updated.kind,
              attempts: updated.attempts,
              error: message,
            }),
          },
        );
      }
    });
  }

  private json(value: unknown): Prisma.InputJsonObject {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
  }
}
