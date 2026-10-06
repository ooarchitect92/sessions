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
import { publicWorkspaceBranding } from '../common/branding/workspace-branding';
import {
  renderEmailTemplate,
  workspaceEmailTemplates,
  type EmailTemplatePurpose,
  type WorkspaceEmailTemplates,
} from '../common/notifications/workspace-email-templates';

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
    const templateContext = await this.templateContext(
      transaction,
      reservation.workspaceId,
    );

    const base = {
      organizationId: reservation.organizationId,
      workspaceId: reservation.workspaceId,
      sessionId: reservation.sessionId,
      bookingReservationId: reservation.id,
      requestedByUserId: bookingPage.createdById,
      recipients: [reservation.email] as Prisma.InputJsonValue,
    };

    const confirmation = this.render(
      templateContext,
      'BOOKING_CONFIRMATION',
      {
        subject: `Booking confirmed: ${bookingPage.title}`,
        body: this.bookingBody(
          bookingPage,
          reservation,
          'Your booking is confirmed.',
        ),
      },
      this.bookingVariables(
        templateContext.brandName,
        bookingPage,
        reservation,
        'Your booking is confirmed.',
      ),
    );
    await transaction.emailDelivery.create({
      data: {
        ...base,
        purpose: 'BOOKING_CONFIRMATION',
        scheduledFor: new Date(),
        subject: confirmation.subject,
        body: confirmation.body,
      },
    });

    await this.queueReminder(
      transaction,
      base,
      'BOOKING_REMINDER_24H',
      new Date(reservation.startsAt.getTime() - 24 * 60 * 60 * 1000),
      ...Object.values(
        this.render(
          templateContext,
          'BOOKING_REMINDER_24H',
          {
            subject: `Reminder: ${bookingPage.title} is tomorrow`,
            body: this.bookingBody(
              bookingPage,
              reservation,
              'Reminder: your booking starts in about 24 hours.',
            ),
          },
          this.bookingVariables(
            templateContext.brandName,
            bookingPage,
            reservation,
            'Reminder: your booking starts in about 24 hours.',
          ),
        ),
      ),
    );
    await this.queueReminder(
      transaction,
      base,
      'BOOKING_REMINDER_1H',
      new Date(reservation.startsAt.getTime() - 60 * 60 * 1000),
      ...Object.values(
        this.render(
          templateContext,
          'BOOKING_REMINDER_1H',
          {
            subject: `Reminder: ${bookingPage.title} starts soon`,
            body: this.bookingBody(
              bookingPage,
              reservation,
              'Reminder: your booking starts in about 1 hour.',
            ),
          },
          this.bookingVariables(
            templateContext.brandName,
            bookingPage,
            reservation,
            'Reminder: your booking starts in about 1 hour.',
          ),
        ),
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
    const templateContext = await this.templateContext(
      transaction,
      reservation.workspaceId,
    );

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

    const rescheduled = this.render(
      templateContext,
      'BOOKING_RESCHEDULED',
      {
        subject: `Booking rescheduled: ${bookingPage.title}`,
        body: this.bookingBody(
          bookingPage,
          reservation,
          'Your booking has been rescheduled.',
        ),
      },
      this.bookingVariables(
        templateContext.brandName,
        bookingPage,
        reservation,
        'Your booking has been rescheduled.',
      ),
    );
    await transaction.emailDelivery.create({
      data: {
        ...base,
        purpose: 'BOOKING_RESCHEDULED',
        scheduledFor: new Date(),
        subject: rescheduled.subject,
        body: rescheduled.body,
      },
    });

    await this.queueReminder(
      transaction,
      base,
      'BOOKING_REMINDER_24H',
      new Date(reservation.startsAt.getTime() - 24 * 60 * 60 * 1000),
      ...Object.values(
        this.render(
          templateContext,
          'BOOKING_REMINDER_24H',
          {
            subject: `Reminder: ${bookingPage.title} is tomorrow`,
            body: this.bookingBody(
              bookingPage,
              reservation,
              'Reminder: your booking starts in about 24 hours.',
            ),
          },
          this.bookingVariables(
            templateContext.brandName,
            bookingPage,
            reservation,
            'Reminder: your booking starts in about 24 hours.',
          ),
        ),
      ),
    );
    await this.queueReminder(
      transaction,
      base,
      'BOOKING_REMINDER_1H',
      new Date(reservation.startsAt.getTime() - 60 * 60 * 1000),
      ...Object.values(
        this.render(
          templateContext,
          'BOOKING_REMINDER_1H',
          {
            subject: `Reminder: ${bookingPage.title} starts soon`,
            body: this.bookingBody(
              bookingPage,
              reservation,
              'Reminder: your booking starts in about 1 hour.',
            ),
          },
          this.bookingVariables(
            templateContext.brandName,
            bookingPage,
            reservation,
            'Reminder: your booking starts in about 1 hour.',
          ),
        ),
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
    const templateContext = await this.templateContext(
      transaction,
      reservation.workspaceId,
    );

    await transaction.emailDelivery.deleteMany({
      where: {
        bookingReservationId: reservation.id,
        status: 'PENDING',
        purpose: { in: ['BOOKING_REMINDER_24H', 'BOOKING_REMINDER_1H'] },
      },
    });

    const cancelled = this.render(
      templateContext,
      'BOOKING_CANCELLED',
      {
        subject: `Booking cancelled: ${bookingPage.title}`,
        body: this.bookingBody(
          bookingPage,
          reservation,
          'Your booking has been cancelled.',
        ),
      },
      this.bookingVariables(
        templateContext.brandName,
        bookingPage,
        reservation,
        'Your booking has been cancelled.',
      ),
    );
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
        subject: cancelled.subject,
        body: cancelled.body,
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
    const templateContext = await this.templateContext(
      transaction,
      registration.workspaceId,
    );

    const base = {
      organizationId: registration.organizationId,
      workspaceId: registration.workspaceId,
      sessionId: event.sessionId,
      eventRegistrationId: registration.id,
      requestedByUserId: event.createdById,
      recipients: [registration.email] as Prisma.InputJsonValue,
    };

    if (registration.status === RegistrationStatus.WAITLISTED) {
      const waitlist = this.render(
        templateContext,
        'EVENT_WAITLIST',
        {
          subject: `Waitlist: ${event.title}`,
          body: this.eventBody(
            event,
            registration,
            'You are currently on the waitlist. We will keep your registration on record.',
          ),
        },
        this.eventVariables(
          templateContext.brandName,
          event,
          registration,
          'You are currently on the waitlist. We will keep your registration on record.',
        ),
      );
      await transaction.emailDelivery.create({
        data: {
          ...base,
          purpose: 'EVENT_WAITLIST',
          scheduledFor: new Date(),
          subject: waitlist.subject,
          body: waitlist.body,
        },
      });
      return;
    }

    if (registration.status !== RegistrationStatus.REGISTERED) return;

    const confirmation = this.render(
      templateContext,
      'EVENT_CONFIRMATION',
      {
        subject: `Registration confirmed: ${event.title}`,
        body: this.eventBody(
          event,
          registration,
          'Your event registration is confirmed.',
        ),
      },
      this.eventVariables(
        templateContext.brandName,
        event,
        registration,
        'Your event registration is confirmed.',
      ),
    );
    await transaction.emailDelivery.create({
      data: {
        ...base,
        purpose: 'EVENT_CONFIRMATION',
        scheduledFor: new Date(),
        subject: confirmation.subject,
        body: confirmation.body,
      },
    });

    await this.queueReminder(
      transaction,
      base,
      'EVENT_REMINDER_24H',
      new Date(event.startsAt.getTime() - 24 * 60 * 60 * 1000),
      ...Object.values(
        this.render(
          templateContext,
          'EVENT_REMINDER_24H',
          {
            subject: `Reminder: ${event.title} is tomorrow`,
            body: this.eventBody(
              event,
              registration,
              'Reminder: the event starts in about 24 hours.',
            ),
          },
          this.eventVariables(
            templateContext.brandName,
            event,
            registration,
            'Reminder: the event starts in about 24 hours.',
          ),
        ),
      ),
    );
    await this.queueReminder(
      transaction,
      base,
      'EVENT_REMINDER_1H',
      new Date(event.startsAt.getTime() - 60 * 60 * 1000),
      ...Object.values(
        this.render(
          templateContext,
          'EVENT_REMINDER_1H',
          {
            subject: `Reminder: ${event.title} starts soon`,
            body: this.eventBody(
              event,
              registration,
              'Reminder: the event starts in about 1 hour.',
            ),
          },
          this.eventVariables(
            templateContext.brandName,
            event,
            registration,
            'Reminder: the event starts in about 1 hour.',
          ),
        ),
      ),
    );
  }

  private async templateContext(
    transaction: Prisma.TransactionClient,
    workspaceId: string,
  ): Promise<{
    templates: WorkspaceEmailTemplates;
    brandName: string;
  }> {
    const workspace = await transaction.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true, settings: true },
    });
    const name = workspace?.name ?? 'Sessions';
    return {
      templates: workspaceEmailTemplates(workspace?.settings),
      brandName: publicWorkspaceBranding(workspace?.settings, name).brandName ?? name,
    };
  }

  private render(
    context: { templates: WorkspaceEmailTemplates },
    purpose: EmailTemplatePurpose,
    defaults: { subject: string; body: string },
    variables: Record<string, string>,
  ) {
    return renderEmailTemplate(context.templates, purpose, defaults, variables);
  }

  private bookingVariables(
    brandName: string,
    bookingPage: BookingPage,
    reservation: BookingReservation,
    statusMessage: string,
  ): Record<string, string> {
    return {
      name: reservation.name,
      title: bookingPage.title,
      starts_at: this.formatInZone(reservation.startsAt, reservation.timezone),
      ends_at: this.formatInZone(reservation.endsAt, reservation.timezone),
      timezone: reservation.timezone,
      brand_name: brandName,
      status_message: statusMessage,
    };
  }

  private eventVariables(
    brandName: string,
    event: Event,
    registration: EventRegistration,
    statusMessage: string,
  ): Record<string, string> {
    const endsAt = new Date(event.startsAt.getTime() + event.durationMinutes * 60_000);
    return {
      name: registration.name,
      title: event.title,
      starts_at: this.formatInZone(event.startsAt, event.timezone),
      ends_at: this.formatInZone(endsAt, event.timezone),
      timezone: event.timezone,
      brand_name: brandName,
      status_message: statusMessage,
    };
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
