import { describe, expect, it } from 'vitest';
import { analyticsRowsToCsv } from './workspace-analytics-csv';

describe('workspace analytics CSV', () => {
  it('renders a deterministic aggregate-only export', () => {
    expect(
      analyticsRowsToCsv([
        {
          date: '2026-10-10',
          sessionsScheduled: 2,
          uniqueAttendees: 3,
          attendanceSeconds: 3600,
          engagementEvents: 12,
          eventsScheduled: 1,
          registrationsCreated: 5,
          bookingReservationsCreated: 4,
        },
      ]),
    ).toContain('2026-10-10,2,3,3600,12,1,5,4');
  });
});
