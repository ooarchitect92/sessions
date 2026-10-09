export function analyticsRowsToCsv(
  rows: Array<{
    date: string;
    sessionsScheduled: number;
    uniqueAttendees: number;
    attendanceSeconds: number;
    engagementEvents: number;
    eventsScheduled: number;
    registrationsCreated: number;
    bookingReservationsCreated: number;
  }>,
): string {
  const header = [
    'date',
    'sessions_scheduled',
    'unique_attendees',
    'attendance_seconds',
    'engagement_events',
    'events_scheduled',
    'registrations_created',
    'booking_reservations_created',
  ];
  const lines = rows.map((row) =>
    [
      row.date,
      row.sessionsScheduled,
      row.uniqueAttendees,
      row.attendanceSeconds,
      row.engagementEvents,
      row.eventsScheduled,
      row.registrationsCreated,
      row.bookingReservationsCreated,
    ].join(','),
  );
  return [header.join(','), ...lines].join('\n') + '\n';
}
