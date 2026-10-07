import { describe, expect, it } from 'vitest';
import { mergeAttendanceRanges } from './attendance-math';

describe('mergeAttendanceRanges', () => {
  it('does not double count overlapping browser connections', () => {
    expect(
      mergeAttendanceRanges([
        { start: 0, end: 10_000 },
        { start: 5_000, end: 15_000 },
      ]),
    ).toBe(15_000);
  });

  it('adds disconnected attendance windows', () => {
    expect(
      mergeAttendanceRanges([
        { start: 0, end: 10_000 },
        { start: 20_000, end: 25_000 },
      ]),
    ).toBe(15_000);
  });

  it('returns zero for no attendance', () => {
    expect(mergeAttendanceRanges([])).toBe(0);
  });
});
