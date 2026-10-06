import { Injectable } from '@nestjs/common';
import {
  BookingStatus,
  type BookingPage,
  type BookingReservation,
  type Event,
  type EventRegistration,
  type Prisma,
  RegistrationStatus,
} from '@prisma/client';

@Injectable()
export class NotificationSchedulerService {
  async queueBookingLifecycleEmails(
    transaction: Prisma.TransactionClient,
    input: {
      bookingPage: BookingPage;
      reservation: BookingReservation;
    },
  ): Promise<void> {
    const { bookingPage, reservation } = input;
    if (!reservation.sessionId || reservation.status !== BookingStatus.CONFIRMED) return;

    const base = {
      organizationId: reservation.organizationId,
      workspaceId: reservation.workspaceId,
      sessionId: reservation.sessionId,
      bookingReservationId: reservation.id,
      requestedByUserId: bookingPage.createdById,
      recipients: [reservation.email] as Prisma.InputJsonValue,
    };

    await transaction.emailDelivery.create({
      data: {
        ...base,
        purpose: 'BOOKING_CONFIRMATION',
        scheduledFor: new Date(),
        subject: `Booking confirmed: ${bookingPage.title}`,
        body: this.bookingBody(
          bookingPage,
          reservation,
          'Your booking is confirmed.',
        ),
      },
    });

    await this.queueReminder(
      transaction,
      base,
      'BOOKING_REMINDER_24H',
      new Date(reservation.startsAt.getTime() - 24 * 60 * 60 * 1000),
      `Reminder: ${bookingPage.title} is tomorrow`,
      this.bookingBody(
        bookingPage,
        reservation,
        'Reminder: your booking starts in about 24 hours.',
      ),
    );
    await this.queueReminder(
      transaction,
      base,
      'BOOKING_REMINDER_1H',
      new Date(reservation.startsAt.getTime() - 60 * 60 * 1000),
      `Reminder: ${bookingPage.title} starts soon`,
      this.bookingBody(
        bookingPage,
        reservation,
        'Reminder: your booking starts in about 1 hour.',
      ),
    );
  }

  async rescheduleBookingLifecycleEmails(
    transaction: Prisma.TransactionClient,
    input: {
      bookingPage: BookingPage;
      reservation: BookingReservation;
    },
  ): Promise<void> {
    const { bookingPage, reservation } = input;
    if (!reservation.sessionId || reservation.status !== BookingStatus.CONFIRMED) return;

    await transaction.emailDelivery.deleteMany({
      where: {
        bookingReservationId: reservation.id,
        status: 'PENDING',
        purpose: { in: ['BOOKING_REMINDER_24H', 'BOOKING_REMINDER_1H'] },
      },
    });

    const base = {
      organizationId: reservation.organizationId,
      workspaceId: reservation.workspaceId,
      sessionId: reservation.sessionId,
      bookingReservationId: reservation.id,
      requestedByUserId: bookingPage.createdById,
      recipients: [reservation.email] as Prisma.InputJsonValue,
    };

    await transaction.emailDelivery.create({
      data: {
        ...base,
        purpose: 'BOOKING_RESCHEDULED',
        scheduledFor: new Date(),
        subject: `Booking rescheduled: ${bookingPage.title}`,
        body: this.bookingBody(
          bookingPage,
          reservation,
          'Your booking has been rescheduled.',
        ),
      },
    });

    await this.queueReminder(
      transaction,
      base,
      'BOOKING_REMINDER_24H',
      new Date(reservation.startsAt.getTime() - 24 * 60 * 60 * 1000),
      `Reminder: ${bookingPage.title} is tomorrow`,
      this.bookingBody(
        bookingPage,
        reservation,
        'Reminder: your booking starts in about 24 hours.',
      ),
    );
    await this.queueReminder(
      transaction,
      base,
      'BOOKING_REMINDER_1H',
      new Date(reservation.startsAt.getTime() - 60 * 60 * 1000),
      `Reminder: ${bookingPage.title} starts soon`,
      this.bookingBody(
        bookingPage,
        reservation,
        'Reminder: your booking starts in about 1 hour.',
      ),
    );
  }

  async cancelBookingLifecycleEmails(
    transaction: Prisma.TransactionClient,
    input: {
      bookingPage: BookingPage;
      reservation: BookingReservation;
    },
  ): Promise<void> {
    const { bookingPage, reservation } = input;
    if (!reservation.sessionId) return;

    await transaction.emailDelivery.deleteMany({
      where: {
        bookingReservationId: reservation.id,
        status: 'PENDING',
        purpose: { in: ['BOOKING_REMINDER_24H', 'BOOKING_REMINDER_1H'] },
      },
    });

    await transaction.emailDelivery.create({
      data: {
        organizationId: reservation.organizationId,
        workspaceId: reservation.workspaceId,
        sessionId: reservation.sessionId,
        bookingReservationId: reservation.id,
        requestedByUserId: bookingPage.createdById,
        recipients: [reservation.email] as Prisma.InputJsonValue,
        purpose: 'BOOKING_CANCELLED',
        scheduledFor: new Date(),
        subject: `Booking cancelled: ${bookingPage.title}`,
        body: this.bookingBody(
          bookingPage,
          reservation,
          'Your booking has been cancelled.',
        ),
      },
    });
  }

  async queueEventRegistrationEmails(
    transaction: Prisma.TransactionClient,
    input: {
      event: Event;
      registration: EventRegistration;
    },
  ): Promise<void> {
    const { event, registration } = input;
    if (!event.sessionId) return;

    const base = {
      organizationId: registration.organizationId,
      workspaceId: registration.workspaceId,
      sessionId: event.sessionId,
      eventRegistrationId: registration.id,
      requestedByUserId: event.createdById,
      recipients: [registration.email] as Prisma.InputJsonValue,
    };

    if (registration.status === RegistrationStatus.WAITLISTED) {
      await transaction.emailDelivery.create({
        data: {
          ...base,
          purpose: 'EVENT_WAITLIST',
          scheduledFor: new Date(),
          subject: `Waitlist: ${event.title}`,
          body: this.eventBody(
            event,
            registration,
            'You are currently on the waitlist. We will keep your registration on record.',
          ),
        },
      });
      return;
    }

    if (registration.status !== RegistrationStatus.REGISTERED) return;

    await transaction.emailDelivery.create({
      data: {
        ...base,
        purpose: 'EVENT_CONFIRMATION',
        scheduledFor: new Date(),
        subject: `Registration confirmed: ${event.title}`,
        body: this.eventBody(
          event,
          registration,
          'Your event registration is confirmed.',
        ),
      },
    });

    await this.queueReminder(
      transaction,
      base,
      'EVENT_REMINDER_24H',
      new Date(event.startsAt.getTime() - 24 * 60 * 60 * 1000),
      `Reminder: ${event.title} is tomorrow`,
      this.eventBody(
        event,
        registration,
        'Reminder: the event starts in about 24 hours.',
      ),
    );
    await this.queueReminder(
      transaction,
      base,
      'EVENT_REMINDER_1H',
      new Date(event.startsAt.getTime() - 60 * 60 * 1000),
      `Reminder: ${event.title} starts soon`,
      this.eventBody(
        event,
        registration,
        'Reminder: the event starts in about 1 hour.',
      ),
    );
  }

  private async queueReminder(
    transaction: Prisma.TransactionClient,
    base: {
      organizationId: string;
      workspaceId: string;
      sessionId: string;
      requestedByUserId: string;
      recipients: Prisma.InputJsonValue;
      bookingReservationId?: string;
      eventRegistrationId?: string;
    },
    purpose: string,
    scheduledFor: Date,
    subject: string,
    body: string,
  ): Promise<void> {
    if (scheduledFor.getTime() <= Date.now() + 30_000) return;
    await transaction.emailDelivery.create({
      data: {
        ...base,
        purpose,
        scheduledFor,
        subject,
        body,
      },
    });
  }

  private bookingBody(
    bookingPage: BookingPage,
    reservation: BookingReservation,
    intro: string,
  ): string {
    return [
      `Hi ${reservation.name},`,
      '',
      intro,
      '',
      `Booking: ${bookingPage.title}`,
      `Starts: ${this.formatInZone(reservation.startsAt, reservation.timezone)}`,
      `Ends: ${this.formatInZone(reservation.endsAt, reservation.timezone)}`,
      `Timezone: ${reservation.timezone}`,
      '',
      'If the host reschedules or cancels this booking, your calendar connection and future reminders will follow the updated booking state.',
    ].join('\n');
  }

  private eventBody(
    event: Event,
    registration: EventRegistration,
    intro: string,
  ): string {
    const endsAt = new Date(event.startsAt.getTime() + event.durationMinutes * 60_000);
    return [
      `Hi ${registration.name},`,
      '',
      intro,
      '',
      `Event: ${event.title}`,
      `Starts: ${this.formatInZone(event.startsAt, event.timezone)}`,
      `Ends: ${this.formatInZone(endsAt, event.timezone)}`,
      `Timezone: ${event.timezone}`,
    ].join('\n');
  }

  private formatInZone(value: Date, timeZone: string): string {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone,
    }).format(value);
  }
}
