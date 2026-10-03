import { describe, expect, it } from 'vitest';
import { buildDailyAnalyticsSeries, csvEscape } from './analytics-rollup';

describe('analytics rollup', () => {
  it('builds zero-filled daily series and assigns activity to UTC days', () => {
    const since = new Date('2026-10-01T00:00:00.000Z');
    expect(
      buildDailyAnalyticsSeries(
        since,
        3,
        [{ at: new Date('2026-10-01T12:00:00.000Z') }],
        [
          { at: new Date('2026-10-02T10:00:00.000Z') },
          { at: new Date('2026-10-02T12:00:00.000Z') },
        ],
        [{ at: new Date('2026-10-03T09:00:00.000Z') }],
      ),
    ).toEqual([
      { date: '2026-10-01', sessions: 1, registrations: 0, bookings: 0 },
      { date: '2026-10-02', sessions: 0, registrations: 2, bookings: 0 },
      { date: '2026-10-03', sessions: 0, registrations: 0, bookings: 1 },
    ]);
  });

  it('escapes CSV values safely', () => {
    expect(csvEscape('plain')).toBe('plain');
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('a"b')).toBe('"a""b"');
  });
});
