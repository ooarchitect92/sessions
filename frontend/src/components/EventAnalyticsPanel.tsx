import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

const ENGAGEMENT_LABELS: Record<string, string> = {
  CHAT_MESSAGE: 'Chat messages',
  CHAT_REACTION: 'Chat reactions',
  POLL_RESPONSE: 'Poll responses',
  QUESTION_SUBMITTED: 'Questions submitted',
  QUESTION_VOTE: 'Question votes',
};

export function EventAnalyticsPanel({
  eventId,
  onClose,
}: {
  eventId: string;
  onClose: () => void;
}) {
  const analytics = useQuery({
    queryKey: ['event-analytics', eventId],
    queryFn: () => api.getEventAnalytics(eventId),
    refetchInterval: 30_000,
  });

  if (analytics.isLoading) {
    return <div className="empty-panel">Loading attendance analytics…</div>;
  }

  if (analytics.error) {
    return <div className="error-banner">{analytics.error.message}</div>;
  }

  if (!analytics.data) return null;

  const data = analytics.data;
  const registered =
    (data.registrations.byStatus.REGISTERED ?? 0) +
    (data.registrations.byStatus.ATTENDED ?? 0);
  const attended = data.registrations.byStatus.ATTENDED ?? 0;
  const noShowCandidate = Math.max(0, registered - attended);

  return (
    <section className="event-analytics-panel">
      <div className="event-analytics-heading">
        <div>
          <span className="eyebrow">Audience analytics</span>
          <h3>{data.event.title}</h3>
          <p>
            Durable attendance intervals are merged across reconnects and overlapping
            browser connections. Engagement counts come from persisted collaboration
            events.
          </p>
        </div>
        <button className="button secondary" type="button" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="event-analytics-metrics">
        <article>
          <span>Registrations</span>
          <strong>{data.registrations.total}</strong>
        </article>
        <article>
          <span>Unique attendees</span>
          <strong>{data.attendance.uniqueAttendees}</strong>
        </article>
        <article>
          <span>Live now</span>
          <strong>{data.attendance.activeAttendees}</strong>
        </article>
        <article>
          <span>Avg. attendance</span>
          <strong>{formatDuration(data.attendance.averageAttendanceSeconds)}</strong>
        </article>
        <article>
          <span>Attended registrations</span>
          <strong>{attended}</strong>
        </article>
        <article>
          <span>Not yet attended</span>
          <strong>{noShowCandidate}</strong>
        </article>
      </div>

      <div className="event-analytics-section">
        <div className="event-analytics-section-heading">
          <strong>Engagement</strong>
          <small>Persisted interaction events for this webinar session.</small>
        </div>
        <div className="event-engagement-grid">
          {Object.entries(ENGAGEMENT_LABELS).map(([kind, label]) => (
            <article key={kind}>
              <span>{label}</span>
              <strong>{data.engagement[kind] ?? 0}</strong>
            </article>
          ))}
        </div>
      </div>

      <div className="event-analytics-section">
        <div className="event-analytics-section-heading">
          <strong>Participant attendance</strong>
          <small>
            Concurrent tabs are unioned so overlapping intervals are not double-counted.
          </small>
        </div>

        {data.attendance.participants.length ? (
          <div className="event-attendance-table-wrap">
            <table className="event-attendance-table">
              <thead>
                <tr>
                  <th>Participant</th>
                  <th>First joined</th>
                  <th>Last left</th>
                  <th>Attendance</th>
                  <th>Connections</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.attendance.participants.map((participant) => (
                  <tr key={participant.userId}>
                    <td>
                      <strong>{participant.displayName}</strong>
                      <small>{participant.email}</small>
                    </td>
                    <td>{new Date(participant.firstJoinedAt).toLocaleString()}</td>
                    <td>
                      {participant.lastLeftAt
                        ? new Date(participant.lastLeftAt).toLocaleString()
                        : '—'}
                    </td>
                    <td>{formatDuration(participant.attendanceSeconds)}</td>
                    <td>{participant.connectionCount}</td>
                    <td>
                      <span
                        className={
                          'status-badge ' +
                          (participant.active ? 'status-live' : 'status-ended')
                        }
                      >
                        {participant.active ? 'live' : 'left'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="dynamic-form-empty">
            No attendance has been recorded yet. Attendance begins when an
            authenticated participant joins the realtime session.
          </div>
        )}
      </div>
    </section>
  );
}
