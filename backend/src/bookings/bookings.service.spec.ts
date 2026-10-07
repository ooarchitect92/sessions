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
  assertManagementToken(expectedHash: string, token: string): void;
  buildIcs(
    page: BookingPage,
    reservation: {
      id: string;
      name: string;
      email: string;
      startsAt: Date;
      endsAt: Date;
      status: 'CONFIRMED';
      version: number;
      updatedAt: Date;
      session: { id: string; title: string } | null;
    },
  ): string;
}

function createService(): AvailabilityHarness {
  return new BookingsService(
    undefined as never,
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
});


describe('booking lifecycle security and calendar export', () => {
  it('validates management tokens using a one-way hash', () => {
    const service = createService();
    const hash = service.hashManagementToken('a'.repeat(64));

    expect(hash).toHaveLength(64);
    expect(() =>
      service.assertManagementToken(hash, 'a'.repeat(64)),
    ).not.toThrow();
    expect(() =>
      service.assertManagementToken(hash, 'b'.repeat(64)),
    ).toThrow();
  });

  it('produces an RFC5545 calendar event with stable UID and UTC dates', () => {
    const service = createService();
    const ics = service.buildIcs(page({ description: 'Discovery call agenda' }), {
      id: '20000000-0000-4000-8000-000000000001',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      startsAt: new Date('2030-01-07T09:00:00.000Z'),
      endsAt: new Date('2030-01-07T09:30:00.000Z'),
      status: 'CONFIRMED',
      version: 2,
      updatedAt: new Date('2030-01-01T10:00:00.000Z'),
      session: {
        id: '30000000-0000-4000-8000-000000000001',
        title: 'Discovery call · Ada Lovelace',
      },
    });

    expect(ics).toContain('BEGIN:VCALENDAR\r\n');
    expect(ics).toContain(
      'UID:20000000-0000-4000-8000-000000000001@sessions',
    );
    expect(ics).toContain('DTSTART:20300107T090000Z');
    expect(ics).toContain('DTEND:20300107T093000Z');
    expect(ics).toContain('SEQUENCE:1');
    expect(ics).toContain('STATUS:CONFIRMED');
  });
});
