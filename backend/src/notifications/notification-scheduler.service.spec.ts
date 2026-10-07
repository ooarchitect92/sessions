import {
  BookingStatus,
  RegistrationStatus,
  type BookingPage,
  type BookingReservation,
  type Event,
  type EventRegistration,
} from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { NotificationSchedulerService } from './notification-scheduler.service';

function bookingPage(): BookingPage {
  return {
    id: '10000000-0000-4000-8000-000000000001',
    organizationId: '10000000-0000-4000-8000-000000000002',
    workspaceId: '10000000-0000-4000-8000-000000000003',
    createdById: '10000000-0000-4000-8000-000000000004',
    slug: 'discovery',
    title: 'Discovery call',
    description: null,
    durationMinutes: 30,
    timezone: 'UTC',
    minimumNoticeMinutes: 0,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    availabilityRules: [],
    intakeFields: [],
    active: true,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function reservation(): BookingReservation {
  return {
    id: '20000000-0000-4000-8000-000000000001',
    organizationId: '10000000-0000-4000-8000-000000000002',
    workspaceId: '10000000-0000-4000-8000-000000000003',
    bookingPageId: '10000000-0000-4000-8000-000000000001',
    sessionId: '30000000-0000-4000-8000-000000000001',
    name: 'Ada',
    email: 'ada@example.com',
    startsAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
    endsAt: new Date(Date.now() + 72.5 * 60 * 60 * 1000),
    timezone: 'UTC',
    answers: {},
    status: BookingStatus.CONFIRMED,
    version: 1,
    manageTokenHash: null,
    manageTokenExpiresAt: null,
    rescheduledAt: null,
    cancelledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function event(): Event {
  return {
    id: '40000000-0000-4000-8000-000000000001',
    organizationId: '10000000-0000-4000-8000-000000000002',
    workspaceId: '10000000-0000-4000-8000-000000000003',
    createdById: '10000000-0000-4000-8000-000000000004',
    sessionId: '50000000-0000-4000-8000-000000000001',
    slug: 'summit',
    title: 'Leadership Summit',
    description: null,
    startsAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
    durationMinutes: 60,
    timezone: 'UTC',
    capacity: 100,
    status: 'PUBLISHED',
    registrationFields: [],
    branding: {},
    publishedAt: new Date(),
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function registration(
  status: RegistrationStatus = RegistrationStatus.REGISTERED,
): EventRegistration {
  return {
    id: '60000000-0000-4000-8000-000000000001',
    organizationId: '10000000-0000-4000-8000-000000000002',
    workspaceId: '10000000-0000-4000-8000-000000000003',
    eventId: '40000000-0000-4000-8000-000000000001',
    name: 'Grace',
    email: 'grace@example.com',
    answers: {},
    status,
    admissionTokenHash: null,
    admissionTokenExpiresAt: null,
    registeredAt: new Date(),
    checkedInAt: null,
    updatedAt: new Date(),
  };
}

function transactionHarness() {
  const create = vi.fn(async (input: unknown) => input);
  const deleteMany = vi.fn(async () => ({ count: 2 }));
  const findWorkspace = vi.fn(async () => ({
    name: 'Sales',
    settings: {},
  }));
  return {
    transaction: {
      emailDelivery: { create, deleteMany },
      workspace: { findUnique: findWorkspace },
    } as never,
    create,
    deleteMany,
  };
}

describe('NotificationSchedulerService', () => {
  it('queues booking confirmation plus 24h and 1h reminders', async () => {
    const service = new NotificationSchedulerService();
    const harness = transactionHarness();

    await service.queueBookingLifecycleEmails(harness.transaction, {
      bookingPage: bookingPage(),
      reservation: reservation(),
    });

    expect(harness.create).toHaveBeenCalledTimes(3);
    expect(
      harness.create.mock.calls.map(([call]) => (call as { data: { purpose: string } }).data.purpose),
    ).toEqual([
      'BOOKING_CONFIRMATION',
      'BOOKING_REMINDER_24H',
      'BOOKING_REMINDER_1H',
    ]);
  });

  it('replaces pending booking reminders after reschedule', async () => {
    const service = new NotificationSchedulerService();
    const harness = transactionHarness();

    await service.rescheduleBookingLifecycleEmails(harness.transaction, {
      bookingPage: bookingPage(),
      reservation: reservation(),
    });

    expect(harness.deleteMany).toHaveBeenCalledOnce();
    expect(harness.create).toHaveBeenCalledTimes(3);
    expect(
      harness.create.mock.calls.map(([call]) => (call as { data: { purpose: string } }).data.purpose),
    ).toEqual([
      'BOOKING_RESCHEDULED',
      'BOOKING_REMINDER_24H',
      'BOOKING_REMINDER_1H',
    ]);
  });

  it('queues only a waitlist notice for waitlisted event registrations', async () => {
    const service = new NotificationSchedulerService();
    const harness = transactionHarness();

    await service.queueEventRegistrationEmails(harness.transaction, {
      event: event(),
      registration: registration(RegistrationStatus.WAITLISTED),
    });

    expect(harness.create).toHaveBeenCalledOnce();
    expect(
      (harness.create.mock.calls[0]?.[0] as { data: { purpose: string } }).data.purpose,
    ).toBe('EVENT_WAITLIST');
  });
});
