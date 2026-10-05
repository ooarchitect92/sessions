import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import {
  BookingStatus,
  EventStatus,
  NotificationDeliveryStatus,
  NotificationKind,
  RegistrationStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { SecurityService } from '../auth/security.service';
import { ADMIN_ROLES, hasAnyRole, type Principal } from '../common/auth/principal';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { WorkerPrismaService } from '../database/worker-prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { UpsertNotificationTemplateDto } from './dto/upsert-notification-template.dto';
import { EmailProviderService } from './email-provider.service';
import {
  DEFAULT_NOTIFICATION_TEMPLATES,
  renderNotificationTemplate,
  type NotificationTemplateDefinition,
} from './notification-defaults';

interface ClaimedDelivery {
  id: string;
  organization_id: string;
  workspace_id: string;
  kind: NotificationKind;
  source_id: string;
  recipient_email: string;
  subject: string;
  text_body: string;
  html_body: string | null;
  attempt_count: number;
}

const REMINDER_WINDOW_MS = 25 * 60 * 60 * 1000;
const CONFIRMATION_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const MIN_REMINDER_LEAD_MS = 5 * 60 * 1000;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private planning = false;
  private dispatching = false;

  constructor(
    private readonly database: TenantDatabaseService,
    private readonly workerPrisma: WorkerPrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly security: SecurityService,
    private readonly email: EmailProviderService,
    private readonly config: ConfigService,
  ) {}

  async listTemplates(principal: Principal) {
    this.assertAdmin(principal);
    const custom = await this.database.run(principal, (transaction) =>
      transaction.notificationTemplate.findMany({ orderBy: { kind: 'asc' } }),
    );
    const byKind = new Map(custom.map((template) => [template.kind, template]));
    return Object.values(NotificationKind).map((kind) => {
      const template = byKind.get(kind);
      const fallback = DEFAULT_NOTIFICATION_TEMPLATES[kind];
      return {
        kind,
        custom: Boolean(template),
        id: template?.id ?? null,
        active: template?.active ?? true,
        version: template?.version ?? 0,
        subjectTemplate: template?.subjectTemplate ?? fallback.subjectTemplate,
        textTemplate: template?.textTemplate ?? fallback.textTemplate,
        htmlTemplate: template?.htmlTemplate ?? fallback.htmlTemplate,
        updatedAt: template?.updatedAt?.toISOString() ?? null,
      };
    });
  }

  async upsertTemplate(
    principal: Principal,
    input: UpsertNotificationTemplateDto,
  ) {
    this.assertAdmin(principal);
    return this.database.run(principal, async (transaction) => {
      const template = await transaction.notificationTemplate.upsert({
        where: {
          workspaceId_kind: {
            workspaceId: principal.workspaceId,
            kind: input.kind,
          },
        },
        update: {
          subjectTemplate: input.subjectTemplate.trim(),
          textTemplate: input.textTemplate,
          htmlTemplate: input.htmlTemplate ?? null,
          active: input.active ?? true,
          version: { increment: 1 },
        },
        create: {
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          kind: input.kind,
          subjectTemplate: input.subjectTemplate.trim(),
          textTemplate: input.textTemplate,
          htmlTemplate: input.htmlTemplate ?? null,
          active: input.active ?? true,
        },
      });
      await this.audit.record(transaction, principal, {
        action: 'notification.template.saved',
        resourceType: 'notification_template',
        resourceId: template.id,
        metadata: { kind: template.kind, active: template.active },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'notification_template',
        aggregateId: template.id,
        eventType: 'notification.template.saved',
        payload: {
          id: template.id,
          kind: template.kind,
          active: template.active,
          version: template.version,
        },
      });
      return template;
    });
  }

  async resetTemplate(principal: Principal, kind: NotificationKind) {
    this.assertAdmin(principal);
    return this.database.run(principal, async (transaction) => {
      const existing = await transaction.notificationTemplate.findUnique({
        where: {
          workspaceId_kind: {
            workspaceId: principal.workspaceId,
            kind,
          },
        },
      });
      if (!existing) return { kind, reset: true as const };
      await transaction.notificationTemplate.delete({ where: { id: existing.id } });
      await this.audit.record(transaction, principal, {
        action: 'notification.template.reset',
        resourceType: 'notification_template',
        resourceId: existing.id,
        metadata: { kind },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'notification_template',
        aggregateId: existing.id,
        eventType: 'notification.template.reset',
        payload: { id: existing.id, kind },
      });
      return { kind, reset: true as const };
    });
  }

  async listDeliveries(principal: Principal, limit = 100) {
    this.assertAdmin(principal);
    return this.database.run(principal, (transaction) =>
      transaction.notificationDelivery.findMany({
        orderBy: { createdAt: 'desc' },
        take: Math.min(Math.max(limit, 1), 250),
      }),
    );
  }

  async retryDelivery(principal: Principal, id: string) {
    this.assertAdmin(principal);
    return this.database.run(principal, async (transaction) => {
      const delivery = await transaction.notificationDelivery.findUnique({
        where: { id },
      });
      if (!delivery) throw new NotFoundException('Notification delivery not found');
      const updated = await transaction.notificationDelivery.update({
        where: { id },
        data: {
          status: NotificationDeliveryStatus.RETRYING,
          nextAttemptAt: new Date(),
          lastError: null,
        },
      });
      await this.audit.record(transaction, principal, {
        action: 'notification.delivery.retried',
        resourceType: 'notification_delivery',
        resourceId: id,
        metadata: { kind: delivery.kind },
      });
      return updated;
    });
  }

  @Interval(60_000)
  async planScheduledNotifications(): Promise<void> {
    if (
      this.planning ||
      !this.config.get<boolean>('EMAIL_DELIVERY_ENABLED', false)
    ) {
      return;
    }
    this.planning = true;
    try {
      const now = new Date();
      await this.planBookingNotifications(now);
      await this.planEventNotifications(now);
    } catch (error) {
      this.logger.error(
        'Notification planning cycle failed',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.planning = false;
    }
  }

  @Interval(5_000)
  async dispatchNotifications(): Promise<void> {
    if (
      this.dispatching ||
      !this.config.get<boolean>('EMAIL_DELIVERY_ENABLED', false)
    ) {
      return;
    }
    this.dispatching = true;
    try {
      const deliveries = await this.claimBatch();
      for (const delivery of deliveries) {
        await this.deliver(delivery);
      }
    } catch (error) {
      this.logger.error(
        'Notification dispatch cycle failed',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.dispatching = false;
    }
  }

  private async planBookingNotifications(now: Date): Promise<void> {
    const reservations = await this.workerPrisma.bookingReservation.findMany({
      where: {
        status: BookingStatus.CONFIRMED,
        OR: [
          { createdAt: { gte: new Date(now.getTime() - CONFIRMATION_LOOKBACK_MS) } },
          {
            startsAt: {
              gt: now,
              lte: new Date(now.getTime() + REMINDER_WINDOW_MS),
            },
          },
        ],
      },
      include: {
        bookingPage: true,
        organization: { select: { slug: true, name: true } },
        workspace: { select: { slug: true, name: true } },
      },
      take: 1000,
    });

    for (const reservation of reservations) {
      await this.cancelStaleReminderDeliveries(
        reservation.id,
        reservation.startsAt,
        [
          NotificationKind.BOOKING_REMINDER_24H,
          NotificationKind.BOOKING_REMINDER_1H,
        ],
      );
      const variables = this.bookingVariables(reservation);
      if (
        reservation.createdAt.getTime() >=
        now.getTime() - CONFIRMATION_LOOKBACK_MS
      ) {
        await this.ensureDelivery({
          organizationId: reservation.organizationId,
          workspaceId: reservation.workspaceId,
          kind: NotificationKind.BOOKING_CONFIRMATION,
          sourceId: reservation.id,
          sourceStartsAt: reservation.startsAt,
          recipientEmail: reservation.email,
          recipientName: reservation.name,
          scheduledFor: reservation.createdAt,
          dedupeKey: 'booking:' + reservation.id + ':confirmation',
          variables,
        });
      }

      await this.planReminderPair({
        organizationId: reservation.organizationId,
        workspaceId: reservation.workspaceId,
        sourceId: reservation.id,
        sourceStartsAt: reservation.startsAt,
        recipientEmail: reservation.email,
        recipientName: reservation.name,
        createdAt: reservation.createdAt,
        startsAt: reservation.startsAt,
        variables,
        reminder24Kind: NotificationKind.BOOKING_REMINDER_24H,
        reminder1Kind: NotificationKind.BOOKING_REMINDER_1H,
      });
    }

    const cancelled = await this.workerPrisma.bookingReservation.findMany({
      where: { status: { not: BookingStatus.CONFIRMED } },
      select: { id: true },
      take: 1000,
    });
    if (cancelled.length > 0) {
      await this.workerPrisma.notificationDelivery.updateMany({
        where: {
          kind: {
            in: [
              NotificationKind.BOOKING_CONFIRMATION,
              NotificationKind.BOOKING_REMINDER_24H,
              NotificationKind.BOOKING_REMINDER_1H,
            ],
          },
          status: {
            in: [
              NotificationDeliveryStatus.PENDING,
              NotificationDeliveryStatus.RETRYING,
            ],
          },
          sourceId: { in: cancelled.map((row) => row.id) },
        },
        data: {
          status: NotificationDeliveryStatus.CANCELLED,
          lastError: 'Booking is no longer confirmed',
        },
      });
    }
  }

  private async planEventNotifications(now: Date): Promise<void> {
    const registrations = await this.workerPrisma.eventRegistration.findMany({
      where: {
        status: {
          in: [RegistrationStatus.REGISTERED, RegistrationStatus.WAITLISTED],
        },
        event: {
          status: { in: [EventStatus.PUBLISHED, EventStatus.LIVE] },
        },
        OR: [
          {
            registeredAt: {
              gte: new Date(now.getTime() - CONFIRMATION_LOOKBACK_MS),
            },
          },
          {
            event: {
              startsAt: {
                gt: now,
                lte: new Date(now.getTime() + REMINDER_WINDOW_MS),
              },
            },
          },
        ],
      },
      include: {
        event: true,
        organization: { select: { slug: true, name: true } },
        workspace: { select: { slug: true, name: true } },
      },
      take: 1000,
    });

    for (const registration of registrations) {
      await this.cancelStaleReminderDeliveries(
        registration.id,
        registration.event.startsAt,
        [
          NotificationKind.EVENT_REMINDER_24H,
          NotificationKind.EVENT_REMINDER_1H,
        ],
      );
      const variables = this.eventVariables(registration);
      if (
        registration.registeredAt.getTime() >=
        now.getTime() - CONFIRMATION_LOOKBACK_MS
      ) {
        await this.ensureDelivery({
          organizationId: registration.organizationId,
          workspaceId: registration.workspaceId,
          kind: NotificationKind.EVENT_REGISTRATION_CONFIRMATION,
          sourceId: registration.id,
          sourceStartsAt: registration.event.startsAt,
          recipientEmail: registration.email,
          recipientName: registration.name,
          scheduledFor: registration.registeredAt,
          dedupeKey: 'event-registration:' + registration.id + ':confirmation',
          variables,
        });
      }

      if (registration.status === RegistrationStatus.REGISTERED) {
        await this.planReminderPair({
          organizationId: registration.organizationId,
          workspaceId: registration.workspaceId,
          sourceId: registration.id,
          sourceStartsAt: registration.event.startsAt,
          recipientEmail: registration.email,
          recipientName: registration.name,
          createdAt: registration.registeredAt,
          startsAt: registration.event.startsAt,
          variables,
          reminder24Kind: NotificationKind.EVENT_REMINDER_24H,
          reminder1Kind: NotificationKind.EVENT_REMINDER_1H,
        });
      }
    }

    const inactive = await this.workerPrisma.eventRegistration.findMany({
      where: {
        OR: [
          {
            status: {
              notIn: [
                RegistrationStatus.REGISTERED,
                RegistrationStatus.WAITLISTED,
              ],
            },
          },
          {
            event: {
              status: {
                notIn: [EventStatus.PUBLISHED, EventStatus.LIVE],
              },
            },
          },
        ],
      },
      select: { id: true },
      take: 1000,
    });
    if (inactive.length > 0) {
      await this.workerPrisma.notificationDelivery.updateMany({
        where: {
          kind: {
            in: [
              NotificationKind.EVENT_REGISTRATION_CONFIRMATION,
              NotificationKind.EVENT_REMINDER_24H,
              NotificationKind.EVENT_REMINDER_1H,
            ],
          },
          status: {
            in: [
              NotificationDeliveryStatus.PENDING,
              NotificationDeliveryStatus.RETRYING,
              NotificationDeliveryStatus.DELIVERING,
            ],
          },
          sourceId: { in: inactive.map((row) => row.id) },
        },
        data: {
          status: NotificationDeliveryStatus.CANCELLED,
          lastError: 'Event registration is no longer eligible for delivery',
        },
      });
    }
  }

  private async planReminderPair(input: {
    organizationId: string;
    workspaceId: string;
    sourceId: string;
    sourceStartsAt: Date;
    recipientEmail: string;
    recipientName: string;
    createdAt: Date;
    startsAt: Date;
    variables: Record<string, string>;
    reminder24Kind: NotificationKind;
    reminder1Kind: NotificationKind;
  }): Promise<void> {
    const reminderPlans: Array<[NotificationKind, number]> = [
      [input.reminder24Kind, 24 * 60 * 60 * 1000],
      [input.reminder1Kind, 60 * 60 * 1000],
    ];
    for (const [kind, offsetMs] of reminderPlans) {
      const scheduledFor = new Date(input.startsAt.getTime() - offsetMs);
      if (
        scheduledFor.getTime() <=
        input.createdAt.getTime() + MIN_REMINDER_LEAD_MS
      ) {
        continue;
      }
      await this.ensureDelivery({
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        kind,
        sourceId: input.sourceId,
        sourceStartsAt: input.sourceStartsAt,
        recipientEmail: input.recipientEmail,
        recipientName: input.recipientName,
        scheduledFor,
        dedupeKey:
          input.sourceId + ':' + kind + ':' + input.startsAt.toISOString(),
        variables: input.variables,
      });
    }
  }

  private async ensureDelivery(input: {
    organizationId: string;
    workspaceId: string;
    kind: NotificationKind;
    sourceId: string;
    sourceStartsAt: Date;
    recipientEmail: string;
    recipientName: string;
    scheduledFor: Date;
    dedupeKey: string;
    variables: Record<string, string>;
  }): Promise<void> {
    const existing = await this.workerPrisma.notificationDelivery.findUnique({
      where: { dedupeKey: input.dedupeKey },
      select: { id: true },
    });
    if (existing) return;

    const template = await this.resolveTemplate(input.workspaceId, input.kind);
    if (!template) return;
    const rendered = renderNotificationTemplate(template, input.variables);
    await this.workerPrisma.notificationDelivery.create({
      data: {
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        kind: input.kind,
        dedupeKey: input.dedupeKey,
        sourceId: input.sourceId,
        sourceStartsAt: input.sourceStartsAt,
        recipientEmail: input.recipientEmail.toLowerCase(),
        recipientName: input.recipientName,
        subject: rendered.subjectTemplate,
        textBody: rendered.textTemplate,
        htmlBody: rendered.htmlTemplate,
        scheduledFor: input.scheduledFor,
        nextAttemptAt: input.scheduledFor,
        metadata: input.variables,
      },
    });
  }

  private async resolveTemplate(
    workspaceId: string,
    kind: NotificationKind,
  ): Promise<NotificationTemplateDefinition | null> {
    const custom = await this.workerPrisma.notificationTemplate.findUnique({
      where: { workspaceId_kind: { workspaceId, kind } },
    });
    if (custom && !custom.active) return null;
    return custom
      ? {
          subjectTemplate: custom.subjectTemplate,
          textTemplate: custom.textTemplate,
          htmlTemplate: custom.htmlTemplate ?? '',
        }
      : DEFAULT_NOTIFICATION_TEMPLATES[kind];
  }

  private async cancelStaleReminderDeliveries(
    sourceId: string,
    startsAt: Date,
    kinds: NotificationKind[],
  ): Promise<void> {
    await this.workerPrisma.notificationDelivery.updateMany({
      where: {
        sourceId,
        kind: { in: kinds },
        status: {
          in: [
            NotificationDeliveryStatus.PENDING,
            NotificationDeliveryStatus.RETRYING,
          ],
        },
        sourceStartsAt: { not: startsAt },
      },
      data: {
        status: NotificationDeliveryStatus.CANCELLED,
        lastError: 'Source start time changed; reminder superseded',
      },
    });
  }

  private bookingVariables(reservation: {
    id: string;
    name: string;
    startsAt: Date;
    timezone: string;
    managementTokenEncrypted: string | null;
    bookingPage: { slug: string; title: string };
    organization: { slug: string; name: string };
    workspace: { slug: string; name: string };
  }): Record<string, string> {
    const publicBase = this.config.get<string>(
      'PUBLIC_WEBSITE_URL',
      'http://localhost:3001',
    );
    let token = '';
    if (reservation.managementTokenEncrypted) {
      try {
        token = this.security.decryptSensitiveValue(
          reservation.managementTokenEncrypted,
          'booking-management:' + reservation.id,
        );
      } catch {
        token = '';
      }
    }
    const bookingUrl =
      publicBase +
      '/book/' +
      encodeURIComponent(reservation.organization.slug) +
      '/' +
      encodeURIComponent(reservation.workspace.slug) +
      '/' +
      encodeURIComponent(reservation.bookingPage.slug);
    const manageUrl = token
      ? bookingUrl +
        '?reservationId=' +
        encodeURIComponent(reservation.id) +
        '&token=' +
        encodeURIComponent(token)
      : bookingUrl;
    return {
      name: reservation.name,
      title: reservation.bookingPage.title,
      startsAt: this.formatDate(reservation.startsAt, reservation.timezone),
      timezone: reservation.timezone,
      manageUrl,
      workspaceName: reservation.workspace.name,
      organizationName: reservation.organization.name,
    };
  }

  private eventVariables(registration: {
    name: string;
    status: RegistrationStatus;
    event: {
      slug: string;
      title: string;
      startsAt: Date;
      timezone: string;
    };
    organization: { slug: string; name: string };
    workspace: { slug: string; name: string };
  }): Record<string, string> {
    const publicBase = this.config.get<string>(
      'PUBLIC_WEBSITE_URL',
      'http://localhost:3001',
    );
    const eventUrl =
      publicBase +
      '/events/' +
      encodeURIComponent(registration.organization.slug) +
      '/' +
      encodeURIComponent(registration.workspace.slug) +
      '/' +
      encodeURIComponent(registration.event.slug);
    return {
      name: registration.name,
      title: registration.event.title,
      startsAt: this.formatDate(
        registration.event.startsAt,
        registration.event.timezone,
      ),
      timezone: registration.event.timezone,
      status: registration.status.toLowerCase(),
      eventUrl,
      workspaceName: registration.workspace.name,
      organizationName: registration.organization.name,
    };
  }

  private formatDate(value: Date, timeZone: string): string {
    try {
      return new Intl.DateTimeFormat('en-US', {
        dateStyle: 'full',
        timeStyle: 'short',
        timeZone,
      }).format(value);
    } catch {
      return value.toISOString();
    }
  }

  private async claimBatch(): Promise<ClaimedDelivery[]> {
    const maxAttempts = this.config.get<number>('EMAIL_MAX_ATTEMPTS', 6);
    const sql =
      'UPDATE notification_deliveries AS delivery ' +
      'SET status = \'DELIVERING\'::"NotificationDeliveryStatus", ' +
      'attempt_count = delivery.attempt_count + 1, updated_at = NOW() ' +
      'WHERE delivery.id IN (' +
      'SELECT candidate.id FROM notification_deliveries AS candidate ' +
      'WHERE (candidate.status IN (\'PENDING\'::"NotificationDeliveryStatus", \'RETRYING\'::"NotificationDeliveryStatus") ' +
      'OR (candidate.status = \'DELIVERING\'::"NotificationDeliveryStatus" AND candidate.updated_at < NOW() - INTERVAL \'5 minutes\')) ' +
      'AND candidate.scheduled_for <= NOW() AND candidate.next_attempt_at <= NOW() ' +
      'AND candidate.attempt_count < $1 ' +
      'ORDER BY candidate.scheduled_for, candidate.created_at LIMIT 25 FOR UPDATE SKIP LOCKED' +
      ') RETURNING delivery.id, delivery.organization_id, delivery.workspace_id, ' +
      'delivery.kind, delivery.source_id, delivery.recipient_email, delivery.subject, ' +
      'delivery.text_body, delivery.html_body, delivery.attempt_count';
    return this.workerPrisma.$queryRawUnsafe<ClaimedDelivery[]>(sql, maxAttempts);
  }

  private async deliver(delivery: ClaimedDelivery): Promise<void> {
    try {
      const sent = await this.email.send({
        to: delivery.recipient_email,
        subject: delivery.subject,
        text: delivery.text_body,
        html: delivery.html_body,
      });
      const sentAt = new Date();
      await this.workerPrisma.$transaction(async (transaction) => {
        await transaction.notificationDelivery.update({
          where: { id: delivery.id },
          data: {
            status: NotificationDeliveryStatus.SENT,
            provider: sent.provider,
            providerMessageId: sent.messageId,
            sentAt,
            lastError: null,
          },
        });
        await transaction.outboxEvent.create({
          data: {
            organizationId: delivery.organization_id,
            workspaceId: delivery.workspace_id,
            aggregateType: 'notification_delivery',
            aggregateId: delivery.id,
            eventType: 'notification.sent',
            payload: {
              deliveryId: delivery.id,
              kind: delivery.kind,
              sourceId: delivery.source_id,
              provider: sent.provider,
              providerMessageId: sent.messageId,
              sentAt: sentAt.toISOString(),
            },
          },
        });
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message.slice(0, 4000)
          : 'Email delivery failed';
      const maxAttempts = this.config.get<number>('EMAIL_MAX_ATTEMPTS', 6);
      const terminal = delivery.attempt_count >= maxAttempts;
      const retryDelaySeconds = Math.min(
        3600,
        30 * 2 ** Math.min(delivery.attempt_count - 1, 7),
      );
      await this.workerPrisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: terminal
            ? NotificationDeliveryStatus.FAILED
            : NotificationDeliveryStatus.RETRYING,
          lastError: message,
          nextAttemptAt: terminal
            ? new Date()
            : new Date(Date.now() + retryDelaySeconds * 1000),
        },
      });
    }
  }

  private assertAdmin(principal: Principal): void {
    if (!hasAnyRole(principal, ADMIN_ROLES)) {
      throw new ForbiddenException('An owner or admin role is required');
    }
  }
}
