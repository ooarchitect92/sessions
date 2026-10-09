import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EventReminderKind,
  NotificationStatus,
} from '@prisma/client';
import { HOST_ROLES, hasAnyRole, type Principal } from '../common/auth/principal';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { UpdateEventNotificationTemplateDto } from './dto/update-event-notification-template.dto';
import { UpsertWorkspaceEmailTemplateDto } from './dto/upsert-workspace-email-template.dto';
import { assertEventReminderTemplate } from './event-reminder-template';
import { assertWorkspaceEmailTemplate } from './workspace-email-template';

@Injectable()
export class NotificationsService {
  constructor(private readonly database: TenantDatabaseService) {}

  async listWorkspaceEmailTemplates(principal: Principal) {
    this.assertHost(principal);
    return this.database.run(principal, (transaction) =>
      transaction.$queryRaw<Array<{
        id: string;
        kind: string;
        enabled: boolean;
        subject: string;
        body_text: string;
        signature: string;
        version: number;
        created_at: Date;
        updated_at: Date;
      }>>`
        SELECT id, kind, enabled, subject, body_text, signature, version, created_at, updated_at
        FROM workspace_email_templates
        ORDER BY kind ASC
      `,
    );
  }

  async upsertWorkspaceEmailTemplate(
    principal: Principal,
    input: UpsertWorkspaceEmailTemplateDto,
  ) {
    this.assertHost(principal);
    const subject = input.subject.trim();
    const bodyText = input.bodyText.trim();
    const signature = input.signature?.trim() ?? '';
    assertWorkspaceEmailTemplate(input.kind, subject, bodyText, signature);

    return this.database.run(principal, async (transaction) => {
      const rows = await transaction.$queryRaw<Array<{
        id: string;
        kind: string;
        enabled: boolean;
        subject: string;
        body_text: string;
        signature: string;
        version: number;
        created_at: Date;
        updated_at: Date;
      }>>`
        INSERT INTO workspace_email_templates (
          organization_id, workspace_id, kind, enabled, subject, body_text, signature
        ) VALUES (
          ${principal.organizationId}::uuid,
          ${principal.workspaceId}::uuid,
          ${input.kind},
          ${input.enabled ?? true},
          ${subject},
          ${bodyText},
          ${signature}
        )
        ON CONFLICT (workspace_id, kind)
        DO UPDATE SET
          enabled = EXCLUDED.enabled,
          subject = EXCLUDED.subject,
          body_text = EXCLUDED.body_text,
          signature = EXCLUDED.signature,
          version = workspace_email_templates.version + 1,
          updated_at = NOW()
        RETURNING id, kind, enabled, subject, body_text, signature, version, created_at, updated_at
      `;
      return rows[0];
    });
  }
  async listBookingDeliveries(principal: Principal, reservationId: string) {
    this.assertHost(principal);
    return this.database.run(principal, async (transaction) => {
      const reservation = await transaction.bookingReservation.findUnique({
        where: { id: reservationId },
        select: { id: true },
      });
      if (!reservation) throw new NotFoundException('Reservation not found');
      return transaction.notificationDelivery.findMany({
        where: { bookingReservationId: reservationId },
        orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'asc' }],
      });
    });
  }

  async listEventTemplates(principal: Principal, eventId: string) {
    this.assertHost(principal);
    return this.database.run(principal, async (transaction) => {
      const event = await transaction.event.findUnique({
        where: { id: eventId },
        select: { id: true },
      });
      if (!event) throw new NotFoundException('Event not found');
      return transaction.eventNotificationTemplate.findMany({
        where: { eventId },
        orderBy: { kind: 'asc' },
      });
    });
  }

  async updateEventTemplate(
    principal: Principal,
    eventId: string,
    kind: EventReminderKind,
    expectedVersion: number,
    input: UpdateEventNotificationTemplateDto,
  ) {
    this.assertHost(principal);
    return this.database.run(principal, async (transaction) => {
      const current = await transaction.eventNotificationTemplate.findUnique({
        where: { eventId_kind: { eventId, kind } },
      });
      if (!current) throw new NotFoundException('Event reminder template not found');
      if (current.version !== expectedVersion) {
        throw new ConflictException('Event reminder template version conflict');
      }

      const subject = input.subject?.trim() ?? current.subject;
      const bodyText = input.bodyText?.trim() ?? current.bodyText;
      assertEventReminderTemplate(subject, bodyText);

      const updated = await transaction.eventNotificationTemplate.updateMany({
        where: { id: current.id, version: expectedVersion },
        data: {
          ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
          subject,
          bodyText,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        throw new ConflictException('Event reminder template version conflict');
      }

      return transaction.eventNotificationTemplate.findUniqueOrThrow({
        where: { id: current.id },
      });
    });
  }

  async listEventDeliveries(principal: Principal, eventId: string) {
    this.assertHost(principal);
    return this.database.run(principal, async (transaction) => {
      const event = await transaction.event.findUnique({
        where: { id: eventId },
        select: { id: true },
      });
      if (!event) throw new NotFoundException('Event not found');
      return transaction.eventNotificationDelivery.findMany({
        where: { eventRegistration: { eventId } },
        include: {
          eventRegistration: {
            select: { id: true, name: true, email: true, status: true },
          },
        },
        orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'asc' }],
        take: 500,
      });
    });
  }

  async retry(principal: Principal, deliveryId: string) {
    this.assertHost(principal);
    return this.database.run(principal, async (transaction) => {
      const current = await transaction.notificationDelivery.findUnique({
        where: { id: deliveryId },
      });
      if (!current) throw new NotFoundException('Notification delivery not found');
      if (
        current.status !== NotificationStatus.FAILED &&
        current.status !== NotificationStatus.DEAD_LETTER
      ) {
        throw new ConflictException('Only failed deliveries can be retried');
      }
      return transaction.notificationDelivery.update({
        where: { id: deliveryId },
        data: {
          status: NotificationStatus.PENDING,
          nextAttemptAt: new Date(),
          lastError: null,
        },
      });
    });
  }

  async retryEventDelivery(principal: Principal, deliveryId: string) {
    this.assertHost(principal);
    return this.database.run(principal, async (transaction) => {
      const current = await transaction.eventNotificationDelivery.findUnique({
        where: { id: deliveryId },
      });
      if (!current) {
        throw new NotFoundException('Event notification delivery not found');
      }
      if (
        current.status !== NotificationStatus.FAILED &&
        current.status !== NotificationStatus.DEAD_LETTER
      ) {
        throw new ConflictException('Only failed deliveries can be retried');
      }
      return transaction.eventNotificationDelivery.update({
        where: { id: deliveryId },
        data: {
          status: NotificationStatus.PENDING,
          nextAttemptAt: new Date(),
          lastError: null,
        },
      });
    });
  }

  private assertHost(principal: Principal): void {
    if (!hasAnyRole(principal, HOST_ROLES)) {
      throw new ForbiddenException('A host role is required');
    }
  }
}
