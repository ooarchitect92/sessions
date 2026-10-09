import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EventReminderKind,
  NotificationStatus,
  WorkspaceEmailTemplateKind,
} from '@prisma/client';
import {
  ADMIN_ROLES,
  HOST_ROLES,
  hasAnyRole,
  type Principal,
} from '../common/auth/principal';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { UpdateEventNotificationTemplateDto } from './dto/update-event-notification-template.dto';
import { UpdateWorkspaceEmailTemplateDto } from './dto/update-workspace-email-template.dto';
import { assertEventReminderTemplate } from './event-reminder-template';
import {
  assertWorkspaceEmailTemplate,
  DEFAULT_WORKSPACE_EMAIL_TEMPLATES,
} from './workspace-email-template';

@Injectable()
export class NotificationsService {
  constructor(private readonly database: TenantDatabaseService) {}

  async listWorkspaceTemplates(principal: Principal) {
    this.assertAdmin(principal);
    return this.database.run(principal, async (transaction) => {
      await this.ensureWorkspaceTemplates(transaction, principal);
      return transaction.workspaceEmailTemplate.findMany({
        orderBy: { kind: 'asc' },
      });
    });
  }

  async updateWorkspaceTemplate(
    principal: Principal,
    kind: WorkspaceEmailTemplateKind,
    expectedVersion: number,
    input: UpdateWorkspaceEmailTemplateDto,
  ) {
    this.assertAdmin(principal);
    return this.database.run(principal, async (transaction) => {
      await this.ensureWorkspaceTemplates(transaction, principal);
      const current = await transaction.workspaceEmailTemplate.findUnique({
        where: {
          workspaceId_kind: {
            workspaceId: principal.workspaceId,
            kind,
          },
        },
      });
      if (!current) throw new NotFoundException('Workspace email template not found');
      if (current.version !== expectedVersion) {
        throw new ConflictException(
          `Workspace email template version conflict. Current version is ${current.version}`,
        );
      }
      const subject = input.subject?.trim() ?? current.subject;
      const bodyText = input.bodyText?.trim() ?? current.bodyText;
      const signatureText =
        input.signatureText !== undefined
          ? input.signatureText.trim() || null
          : current.signatureText;
      assertWorkspaceEmailTemplate(kind, subject, bodyText, signatureText);

      const updated = await transaction.workspaceEmailTemplate.updateMany({
        where: { id: current.id, version: expectedVersion },
        data: {
          ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
          subject,
          bodyText,
          signatureText,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        throw new ConflictException('Workspace email template version conflict');
      }
      return transaction.workspaceEmailTemplate.findUniqueOrThrow({
        where: { id: current.id },
      });
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

  private async ensureWorkspaceTemplates(
    transaction: Parameters<Parameters<TenantDatabaseService['run']>[1]>[0],
    principal: Principal,
  ): Promise<void> {
    await transaction.workspaceEmailTemplate.createMany({
      data: (
        Object.entries(DEFAULT_WORKSPACE_EMAIL_TEMPLATES) as Array<
          [
            WorkspaceEmailTemplateKind,
            { subject: string; bodyText: string },
          ]
        >
      ).map(([kind, template]) => ({
        organizationId: principal.organizationId,
        workspaceId: principal.workspaceId,
        kind,
        subject: template.subject,
        bodyText: template.bodyText,
      })),
      skipDuplicates: true,
    });
  }

  private assertAdmin(principal: Principal): void {
    if (!hasAnyRole(principal, ADMIN_ROLES)) {
      throw new ForbiddenException('An owner or admin role is required');
    }
  }

  private assertHost(principal: Principal): void {
    if (!hasAnyRole(principal, HOST_ROLES)) {
      throw new ForbiddenException('A host role is required');
    }
  }
}
