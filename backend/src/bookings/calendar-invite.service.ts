import { Injectable } from '@nestjs/common';
import type { BookingPage, BookingReservation, Session } from '@prisma/client';

@Injectable()
export class CalendarInviteService {
  create(input: {
    reservation: BookingReservation;
    bookingPage: BookingPage;
    session?: Session | null;
  }): { filename: string; mimeType: string; content: string } {
    const { reservation, bookingPage, session } = input;
    const stamp = this.formatUtc(new Date());
    const start = this.formatUtc(reservation.startsAt);
    const end = this.formatUtc(reservation.endsAt);
    const summary = this.escape(session?.title || bookingPage.title);
    const description = this.escape(
      bookingPage.description || 'Scheduled through Sessions',
    );
    const attendee = this.escape(reservation.email);
    const uid = `${reservation.id}@sessions.local`;

    const content = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'PRODID:-//Sessions//Booking//EN',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${description}`,
      `ATTENDEE;CN=${this.escape(reservation.name)}:mailto:${attendee}`,
      `STATUS:${reservation.status === 'CANCELLED' ? 'CANCELLED' : 'CONFIRMED'}`,
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n');

    return {
      filename: `${this.slug(bookingPage.slug || bookingPage.title)}-${reservation.id}.ics`,
      mimeType: 'text/calendar; charset=utf-8',
      content,
    };
  }

  private formatUtc(value: Date): string {
    return value
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}Z$/, 'Z');
  }

  private escape(value: string): string {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/\r?\n/g, '\\n')
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;');
  }

  private slug(value: string): string {
    const normalized = value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
    return normalized || 'booking';
  }
}
