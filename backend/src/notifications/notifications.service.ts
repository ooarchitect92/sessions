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
import { assertEventReminderTemplate } from './event-reminder-template';

@Injectable()
export class NotificationsService {
  constructor(private readonly database: TenantDatabaseService) {}

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
