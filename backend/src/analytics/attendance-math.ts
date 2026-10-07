export type AttendanceRange = {
  start: number;
  end: number;
};

export function mergeAttendanceRanges(ranges: AttendanceRange[]): number {
  if (ranges.length === 0) return 0;
  const sorted = [...ranges].sort((left, right) => left.start - right.start);
  let durationMs = 0;
  const first = sorted[0];
  if (!first) return 0;
  let currentStart = first.start;
  let currentEnd = first.end;

  for (const range of sorted.slice(1)) {
    if (range.start <= currentEnd) {
      currentEnd = Math.max(currentEnd, range.end);
    } else {
      durationMs += Math.max(0, currentEnd - currentStart);
      currentStart = range.start;
      currentEnd = range.end;
    }
  }

  durationMs += Math.max(0, currentEnd - currentStart);
  return durationMs;
}
