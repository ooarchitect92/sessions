export interface DatedMetricInput {
  at: Date;
}

export interface DailyAnalyticsPoint {
  date: string;
  sessions: number;
  registrations: number;
  bookings: number;
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function buildDailyAnalyticsSeries(
  since: Date,
  days: number,
  sessions: DatedMetricInput[],
  registrations: DatedMetricInput[],
  bookings: DatedMetricInput[],
): DailyAnalyticsPoint[] {
  const points = new Map<string, DailyAnalyticsPoint>();
  const start = new Date(
    Date.UTC(
      since.getUTCFullYear(),
      since.getUTCMonth(),
      since.getUTCDate(),
    ),
  );

  for (let index = 0; index < days; index += 1) {
    const date = new Date(start.getTime() + index * 24 * 60 * 60 * 1000);
    const key = dateKey(date);
    points.set(key, { date: key, sessions: 0, registrations: 0, bookings: 0 });
  }

  for (const item of sessions) {
    const point = points.get(dateKey(item.at));
    if (point) point.sessions += 1;
  }
  for (const item of registrations) {
    const point = points.get(dateKey(item.at));
    if (point) point.registrations += 1;
  }
  for (const item of bookings) {
    const point = points.get(dateKey(item.at));
    if (point) point.bookings += 1;
  }

  return [...points.values()];
}

export function csvEscape(value: string | number): string {
  const text = String(value);
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}
