import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

const RANGE_OPTIONS = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
] as const;

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

function metricTone(value: number): 'good' | 'neutral' {
  return value > 0 ? 'good' : 'neutral';
}

export function AnalyticsPage() {
  const [rangeDays, setRangeDays] = useState(30);
  const range = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - rangeDays * 24 * 60 * 60 * 1000);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [rangeDays]);

  const analytics = useQuery({
    queryKey: ['analytics', rangeDays],
    queryFn: () => api.getWorkspaceAnalytics(range),
  });

  const data = analytics.data;
  const maxTrend = Math.max(
    1,
    ...(data?.trend.map((item) =>
      Math.max(item.sessions, item.registrations, item.bookings, item.engagement),
    ) ?? [1]),
  );

  return (
    <section className="analytics-page">
      <div className="analytics-heading">
        <div>
          <span className="eyebrow">Workspace intelligence</span>
          <h1>Analytics</h1>
          <p>
            Track meeting volume, audience activity, bookings, engagement, and
            post-session artifact readiness from persisted workspace data.
          </p>
        </div>
        <div className="analytics-range-picker" aria-label="Analytics date range">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.days}
              type="button"
              className={rangeDays === option.days ? 'active' : ''}
              onClick={() => setRangeDays(option.days)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {analytics.isLoading ? (
        <div className="panel analytics-state">Loading analytics…</div>
      ) : null}

      {analytics.error ? (
        <div className="error-banner">{analytics.error.message}</div>
      ) : null}

      {data ? (
        <>
          <div className="analytics-metric-grid">
            <article className="analytics-metric-card">
              <span>Sessions</span>
              <strong>{formatNumber(data.metrics.sessions)}</strong>
              <small>{data.metrics.completedSessions} completed</small>
            </article>
            <article className="analytics-metric-card">
              <span>Meeting hours</span>
              <strong>{data.metrics.meetingHours}</strong>
              <small>{formatNumber(data.metrics.meetingMinutes)} minutes</small>
            </article>
            <article className="analytics-metric-card">
              <span>Registrations</span>
              <strong>{formatNumber(data.metrics.eventRegistrations)}</strong>
              <small>{data.metrics.attendedRegistrations} attended</small>
            </article>
            <article className="analytics-metric-card">
              <span>Bookings</span>
              <strong>{formatNumber(data.metrics.bookingReservations)}</strong>
              <small>{data.metrics.confirmedBookings} confirmed/completed</small>
            </article>
            <article className="analytics-metric-card">
              <span>Engagement actions</span>
              <strong>{formatNumber(data.metrics.engagementActions)}</strong>
              <small>
                {data.metrics.chatMessages} chat · {data.metrics.pollAnswers} poll
                answers
              </small>
            </article>
            <article className="analytics-metric-card">
              <span>Ready recordings</span>
              <strong>{formatNumber(data.metrics.readyRecordings)}</strong>
              <small>{data.metrics.recordingMinutes} recorded minutes</small>
            </article>
            <article className="analytics-metric-card">
              <span>Ready transcripts</span>
              <strong>{formatNumber(data.metrics.readyTranscripts)}</strong>
              <small>{data.metrics.readySummaries} AI summaries ready</small>
            </article>
            <article className="analytics-metric-card">
              <span>Reviewed summaries</span>
              <strong>{formatNumber(data.metrics.reviewedSummaries)}</strong>
              <small>Human-approved post-session output</small>
            </article>
          </div>

          <div className="analytics-grid">
            <section className="panel analytics-panel">
              <div className="analytics-panel-heading">
                <div>
                  <span className="eyebrow">Daily activity</span>
                  <h2>Workspace trend</h2>
                </div>
                <div className="analytics-legend">
                  <span><i className="legend-sessions" />Sessions</span>
                  <span><i className="legend-registrations" />Registrations</span>
                  <span><i className="legend-bookings" />Bookings</span>
                  <span><i className="legend-engagement" />Engagement</span>
                </div>
              </div>
              <div className="analytics-chart" role="img" aria-label="Daily workspace analytics">
                {data.trend.map((item, index) => (
                  <div className="analytics-chart-column" key={item.date}>
                    <div className="analytics-bars">
                      <span
                        className="bar sessions"
                        style={{ height: `${Math.max(2, (item.sessions / maxTrend) * 100)}%` }}
                        title={`${item.sessions} sessions`}
                      />
                      <span
                        className="bar registrations"
                        style={{ height: `${Math.max(2, (item.registrations / maxTrend) * 100)}%` }}
                        title={`${item.registrations} registrations`}
                      />
                      <span
                        className="bar bookings"
                        style={{ height: `${Math.max(2, (item.bookings / maxTrend) * 100)}%` }}
                        title={`${item.bookings} bookings`}
                      />
                      <span
                        className="bar engagement"
                        style={{ height: `${Math.max(2, (item.engagement / maxTrend) * 100)}%` }}
                        title={`${item.engagement} engagement actions`}
                      />
                    </div>
                    {index % Math.max(1, Math.ceil(data.trend.length / 7)) === 0 ? (
                      <small>{formatDate(item.date)}</small>
                    ) : (
                      <small aria-hidden="true">&nbsp;</small>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="panel analytics-panel">
              <div className="analytics-panel-heading">
                <div>
                  <span className="eyebrow">Audience quality</span>
                  <h2>Attendance & no-shows</h2>
                </div>
              </div>
              <div className="analytics-health-list">
                <div>
                  <span>Registration no-show rate</span>
                  <strong className={metricTone(data.metrics.registrationNoShowRate)}>
                    {data.metrics.registrationNoShowRate}%
                  </strong>
                </div>
                <div>
                  <span>Booking no-show rate</span>
                  <strong className={metricTone(data.metrics.bookingNoShowRate)}>
                    {data.metrics.bookingNoShowRate}%
                  </strong>
                </div>
                <div>
                  <span>Polls launched</span>
                  <strong>{data.metrics.polls}</strong>
                </div>
                <div>
                  <span>Questions submitted</span>
                  <strong>{data.metrics.questions}</strong>
                </div>
                <div>
                  <span>Question votes</span>
                  <strong>{data.metrics.questionVotes}</strong>
                </div>
              </div>
            </section>
          </div>

          <section className="panel analytics-panel analytics-recent-panel">
            <div className="analytics-panel-heading">
              <div>
                <span className="eyebrow">Recent activity</span>
                <h2>Recent sessions</h2>
              </div>
            </div>
            <div className="analytics-table">
              <div className="analytics-table-row analytics-table-head">
                <span>Session</span>
                <span>Type</span>
                <span>Status</span>
                <span>Duration</span>
                <span>Date</span>
              </div>
              {data.recentSessions.map((session) => (
                <div className="analytics-table-row" key={session.id}>
                  <strong>{session.title}</strong>
                  <span>{session.kind.toLowerCase()}</span>
                  <span>{session.status.toLowerCase()}</span>
                  <span>{session.durationMinutes} min</span>
                  <span>{new Date(session.startsAt).toLocaleString()}</span>
                </div>
              ))}
              {data.recentSessions.length === 0 ? (
                <div className="settings-empty-row">No sessions in this range.</div>
              ) : null}
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
}
