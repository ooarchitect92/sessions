import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api } from '../api/client';

function formatMinutes(value: number): string {
  if (value < 60) return `${value} min`;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${value}T00:00:00Z`));
}

export function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const analytics = useQuery({
    queryKey: ['analytics-overview', days],
    queryFn: () => api.getAnalyticsOverview(days),
  });

  const exportCsv = useMutation({
    mutationFn: () => api.exportAnalytics(days),
    onSuccess: (result) => {
      const blob = new Blob([result.content], { type: result.contentType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    },
  });

  const maxDaily = useMemo(() => {
    const points = analytics.data?.daily ?? [];
    return Math.max(
      1,
      ...points.flatMap((point) => [
        point.sessions,
        point.registrations,
        point.bookings,
      ]),
    );
  }, [analytics.data?.daily]);

  return (
    <div className="workflow-page analytics-page">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Workspace intelligence</span>
          <h1>Understand what is happening across your sessions.</h1>
          <p>
            This dashboard aggregates tenant-scoped meeting, event, booking, engagement,
            recording, and AI-memory activity without exposing another workspace&apos;s data.
          </p>
        </div>
        <div className="heading-actions">
          <select
            className="analytics-range-select"
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
            aria-label="Analytics range"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last year</option>
          </select>
          <button
            className="button secondary"
            type="button"
            disabled={exportCsv.isPending || !analytics.data}
            onClick={() => exportCsv.mutate()}
          >
            {exportCsv.isPending ? 'Preparing export…' : 'Export CSV'}
          </button>
        </div>
      </section>

      {analytics.isLoading ? (
        <section className="panel analytics-loading">Loading workspace analytics…</section>
      ) : null}
      {analytics.error ? (
        <div className="error-banner">{analytics.error.message}</div>
      ) : null}
      {exportCsv.error ? (
        <div className="error-banner">{exportCsv.error.message}</div>
      ) : null}

      {analytics.data ? (
        <>
          <section className="analytics-metric-grid" aria-label="Analytics summary">
            <article className="analytics-metric-card">
              <span>Sessions</span>
              <strong>{analytics.data.sessions.total}</strong>
              <small>
                {analytics.data.sessions.completed} completed ·{' '}
                {analytics.data.sessions.webinars} webinars
              </small>
            </article>
            <article className="analytics-metric-card">
              <span>Scheduled time</span>
              <strong>{formatMinutes(analytics.data.sessions.scheduledMinutes)}</strong>
              <small>Based on scheduled session duration</small>
            </article>
            <article className="analytics-metric-card">
              <span>Registrations</span>
              <strong>{analytics.data.events.registrations}</strong>
              <small>
                {analytics.data.events.attended} attended ·{' '}
                {analytics.data.events.waitlisted} waitlisted
              </small>
            </article>
            <article className="analytics-metric-card">
              <span>Bookings</span>
              <strong>{analytics.data.bookings.total}</strong>
              <small>
                {analytics.data.bookings.confirmed} confirmed/completed ·{' '}
                {analytics.data.bookings.cancelled} cancelled
              </small>
            </article>
            <article className="analytics-metric-card">
              <span>Attendance time</span>
              <strong>
                {formatMinutes(Math.round(analytics.data.attendance.totalSeconds / 60))}
              </strong>
              <small>
                {analytics.data.attendance.participantSessions} participant-session
                presences across {analytics.data.attendance.intervalCount} intervals
              </small>
            </article>
            <article className="analytics-metric-card">
              <span>Engagement actions</span>
              <strong>{analytics.data.engagement.totalActions}</strong>
              <small>
                {analytics.data.engagement.chatMessages} chats ·{' '}
                {analytics.data.engagement.pollAnswers} poll answers ·{' '}
                {analytics.data.engagement.questions} questions
              </small>
            </article>
            <article className="analytics-metric-card">
              <span>Tracked engagement</span>
              <strong>{analytics.data.engagement.unifiedEventCount}</strong>
              <small>
                Durable participant, chat, poll, Q&amp;A, and whiteboard events
              </small>
            </article>
            <article className="analytics-metric-card">
              <span>Memory ready</span>
              <strong>
                {analytics.data.memory.readyRecordings +
                  analytics.data.memory.readySummaries}
              </strong>
              <small>
                {analytics.data.memory.readyRecordings} recordings ·{' '}
                {analytics.data.memory.readySummaries} summaries
              </small>
            </article>
          </section>

          <section className="panel analytics-trend-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Daily activity</span>
                <h2>Sessions, registrations, and bookings</h2>
              </div>
              <span className="state-chip enabled">{analytics.data.range.days} days</span>
            </div>

            <div className="analytics-legend" aria-hidden="true">
              <span><i className="analytics-dot sessions-dot" />Sessions</span>
              <span><i className="analytics-dot registrations-dot" />Registrations</span>
              <span><i className="analytics-dot bookings-dot" />Bookings</span>
            </div>

            <div className="analytics-chart" role="img" aria-label="Daily workspace activity">
              {analytics.data.daily.map((point) => (
                <div className="analytics-day" key={point.date}>
                  <div className="analytics-bars">
                    <span
                      className="analytics-bar sessions-bar"
                      style={{ height: `${Math.max(4, (point.sessions / maxDaily) * 100)}%` }}
                      title={`${point.sessions} sessions`}
                    />
                    <span
                      className="analytics-bar registrations-bar"
                      style={{ height: `${Math.max(4, (point.registrations / maxDaily) * 100)}%` }}
                      title={`${point.registrations} registrations`}
                    />
                    <span
                      className="analytics-bar bookings-bar"
                      style={{ height: `${Math.max(4, (point.bookings / maxDaily) * 100)}%` }}
                      title={`${point.bookings} bookings`}
                    />
                  </div>
                  {(analytics.data.range.days <= 30 ||
                    point.date.endsWith('-01') ||
                    point.date === analytics.data.daily.at(-1)?.date) ? (
                    <small>{formatDate(point.date)}</small>
                  ) : (
                    <small aria-hidden="true">&nbsp;</small>
                  )}
                </div>
              ))}
            </div>
          </section>

          <div className="analytics-detail-grid">
            <section className="panel analytics-detail-card">
              <span className="eyebrow">Actual presence</span>
              <h2>Attendance intervals</h2>
              <dl>
                <div>
                  <dt>Participant sessions</dt>
                  <dd>{analytics.data.attendance.participantSessions}</dd>
                </div>
                <div>
                  <dt>Presence intervals</dt>
                  <dd>{analytics.data.attendance.intervalCount}</dd>
                </div>
                <div>
                  <dt>Tracked attendance</dt>
                  <dd>
                    {formatMinutes(
                      Math.round(analytics.data.attendance.totalSeconds / 60),
                    )}
                  </dd>
                </div>
              </dl>
              <p>
                Presence is calculated from durable realtime join/heartbeat/leave
                intervals rather than assuming everyone attended for the scheduled
                meeting duration.
              </p>
            </section>

            <section className="panel analytics-detail-card">
              <span className="eyebrow">Audience funnel</span>
              <h2>Event outcomes</h2>
              <dl>
                <div><dt>Registered</dt><dd>{analytics.data.events.registrations}</dd></div>
                <div><dt>Attended</dt><dd>{analytics.data.events.attended}</dd></div>
                <div><dt>No-show</dt><dd>{analytics.data.events.noShows}</dd></div>
                <div><dt>Waitlisted</dt><dd>{analytics.data.events.waitlisted}</dd></div>
              </dl>
              <p>
                Attendance here reflects explicit registration status. Durable join/leave
                intervals remain a separate implementation slice.
              </p>
            </section>

            <section className="panel analytics-detail-card">
              <span className="eyebrow">Unified engagement stream</span>
              <h2>Interaction events</h2>
              <dl>
                {Object.entries(analytics.data.engagement.byType)
                  .sort(([left], [right]) => left.localeCompare(right))
                  .map(([eventType, count]) => (
                    <div key={eventType}>
                      <dt>{eventType.replaceAll('.', ' ')}</dt>
                      <dd>{count}</dd>
                    </div>
                  ))}
              </dl>
              <p>
                These are durable, tenant-scoped engagement events used for
                long-term analytics rather than only transient realtime state.
              </p>
            </section>

            <section className="panel analytics-detail-card">
              <span className="eyebrow">Booking outcomes</span>
              <h2>Scheduling activity</h2>
              <dl>
                <div><dt>Total reservations</dt><dd>{analytics.data.bookings.total}</dd></div>
                <div><dt>Confirmed/completed</dt><dd>{analytics.data.bookings.confirmed}</dd></div>
                <div><dt>Completed</dt><dd>{analytics.data.bookings.completed}</dd></div>
                <div><dt>Cancelled</dt><dd>{analytics.data.bookings.cancelled}</dd></div>
              </dl>
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
