import { BadRequestException } from '@nestjs/common';
import type { BookingPage } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { BookingsService } from './bookings.service';
import type { AvailabilityRuleDto } from './dto/create-booking-page.dto';

interface Slot {
  startsAt: string;
  endsAt: string;
}

interface AvailabilityHarness {
  generateSlots(
    page: BookingPage,
    dateFrom: string,
    dateTo: string,
    reservations: { startsAt: Date; endsAt: Date }[],
  ): Slot[];
  validateDateRange(dateFrom: string, dateTo: string): unknown;
  assertAvailabilityRules(rules: AvailabilityRuleDto[]): void;
  hashManagementToken(token: string): string;
  buildCalendarFile(input: {
    id: string;
    title: string;
    description: string | null;
    startsAt: Date;
    endsAt: Date;
    status: 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';
  }): { filename: string; contentType: string; content: string };
}

function createService(): AvailabilityHarness {
  return new BookingsService(
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
  ) as unknown as AvailabilityHarness;
}

function page(overrides: Partial<BookingPage> = {}): BookingPage {
  return {
    id: '10000000-0000-4000-8000-000000000001',
    organizationId: '10000000-0000-4000-8000-000000000002',
    workspaceId: '10000000-0000-4000-8000-000000000003',
    createdById: '10000000-0000-4000-8000-000000000004',
    slug: 'discovery-call',
    title: 'Discovery call',
    description: null,
    durationMinutes: 30,
    timezone: 'UTC',
    minimumNoticeMinutes: 0,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    availabilityRules: [
      { weekday: 1, startTime: '09:00', endTime: '10:00' },
    ],
    intakeFields: [],
    active: true,
    version: 1,
    createdAt: new Date('2030-01-01T00:00:00.000Z'),
    updatedAt: new Date('2030-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('booking availability', () => {
  it('generates deterministic slots in the booking timezone', () => {
    const slots = createService().generateSlots(page(), '2030-01-07', '2030-01-07', []);

    expect(slots).toEqual([
      {
        startsAt: '2030-01-07T09:00:00.000Z',
        endsAt: '2030-01-07T09:30:00.000Z',
      },
      {
        startsAt: '2030-01-07T09:30:00.000Z',
        endsAt: '2030-01-07T10:00:00.000Z',
      },
    ]);
  });

  it('removes overlapping slots and honors buffer windows', () => {
    const reservation = {
      startsAt: new Date('2030-01-07T09:00:00.000Z'),
      endsAt: new Date('2030-01-07T09:30:00.000Z'),
    };
    const service = createService();

    expect(
      service.generateSlots(page(), '2030-01-07', '2030-01-07', [reservation]),
    ).toEqual([
      {
        startsAt: '2030-01-07T09:30:00.000Z',
        endsAt: '2030-01-07T10:00:00.000Z',
      },
    ]);
    expect(
      service.generateSlots(
        page({ bufferBeforeMinutes: 10, bufferAfterMinutes: 10 }),
        '2030-01-07',
        '2030-01-07',
        [reservation],
      ),
    ).toEqual([]);
  });

  it('rejects invalid windows and unbounded slot searches', () => {
    const service = createService();

    expect(() =>
      service.assertAvailabilityRules([
        { weekday: 1, startTime: '10:00', endTime: '10:00' },
      ]),
    ).toThrow(BadRequestException);
    expect(() => service.validateDateRange('2030-01-01', '2030-02-02')).toThrow(
      BadRequestException,
    );
  });

  it('hashes management tokens without exposing the raw credential', () => {
    const service = createService();
    const token = 'booking-management-token-0123456789';

    expect(service.hashManagementToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(service.hashManagementToken(token)).not.toContain(token);
  });

  it('builds a standards-oriented calendar artifact for confirmed and cancelled bookings', () => {
    const service = createService();
    const confirmed = service.buildCalendarFile({
      id: '10000000-0000-4000-8000-000000000010',
      title: 'Discovery, call',
      description: 'Discuss scope; next steps',
      startsAt: new Date('2030-01-07T09:00:00.000Z'),
      endsAt: new Date('2030-01-07T09:30:00.000Z'),
      status: 'CONFIRMED',
    });

    expect(confirmed.contentType).toContain('text/calendar');
    expect(confirmed.content).toContain('DTSTART:20300107T090000Z');
    expect(confirmed.content).toContain('SUMMARY:Discovery\\, call');
    expect(confirmed.content).toContain('DESCRIPTION:Discuss scope\\; next steps');
    expect(confirmed.content).toContain('STATUS:CONFIRMED');

    const cancelled = service.buildCalendarFile({
      id: '10000000-0000-4000-8000-000000000010',
      title: 'Discovery call',
      description: null,
      startsAt: new Date('2030-01-07T09:00:00.000Z'),
      endsAt: new Date('2030-01-07T09:30:00.000Z'),
      status: 'CANCELLED',
    });
    expect(cancelled.content).toContain('STATUS:CANCELLED');
  });
});
