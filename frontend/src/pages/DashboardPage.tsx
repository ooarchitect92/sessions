import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateSessionInput, Session } from '@sessions/contracts';
import { FormEvent, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';

function formatSessionTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function csvCell(value: unknown): string {
  const text = String(value ?? '');
  return /[\",\n]/.test(text) ? `\"${text.replaceAll('\"', '\"\"')}\"` : text;
}

function downloadAnalyticsCsv(input: { filename: string; columns: string[]; rows: Array<Record<string, unknown>> }) {
  const csv = [
    input.columns.map(csvCell).join(','),
    ...input.rows.map((row) => input.columns.map((column) => csvCell(row[column])).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = input.filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
function statusClass(status: Session['status']): string {
  return `status-badge status-${status.toLowerCase()}`;
}

function CreateSessionDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const tomorrow = useMemo(() => {
    const value = new Date(Date.now() + 60 * 60 * 1000);
    value.setSeconds(0, 0);
    return value.toISOString().slice(0, 16);
  }, []);
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState(tomorrow);
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [recordingEnabled, setRecordingEnabled] = useState(false);
  const [transcriptionEnabled, setTranscriptionEnabled] = useState(true);

  const create = useMutation({
    mutationFn: async (input: CreateSessionInput) => {
      const created = await api.createSession(input);
      return api.transitionSession(created.id, created.version, 'publish');
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['sessions'] });
      onClose();
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate({
      title,
      kind: 'MEETING',
      startsAt: new Date(startsAt).toISOString(),
      durationMinutes,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      recordingEnabled,
      transcriptionEnabled,
    });
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-session-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">New meeting</span>
            <h2 id="create-session-title">Create a focused session</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form onSubmit={submit} className="form-stack">
          <label>
            Session title
            <input
              autoFocus
              required
              maxLength={160}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Customer onboarding workshop"
            />
          </label>
          <div className="form-grid">
            <label>
              Date and time
              <input
                required
                type="datetime-local"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
              />
            </label>
            <label>
              Duration
              <select
                value={durationMinutes}
                onChange={(event) => setDurationMinutes(Number(event.target.value))}
              >
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={45}>45 minutes</option>
                <option value={60}>60 minutes</option>
                <option value={90}>90 minutes</option>
              </select>
            </label>
          </div>
          <div className="toggle-row">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={recordingEnabled}
                onChange={(event) => setRecordingEnabled(event.target.checked)}
              />
              <span>
                <strong>Cloud recording</strong>
                <small>Consent is still required before capture starts.</small>
              </span>
            </label>
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={transcriptionEnabled}
                onChange={(event) => setTranscriptionEnabled(event.target.checked)}
              />
              <span>
                <strong>Transcription</strong>
                <small>Foundation flag only; the STT worker is not enabled yet.</small>
              </span>
            </label>
          </div>
          {create.error ? (
            <div className="error-banner">
              {create.error instanceof ApiError ? create.error.message : 'Unable to create session'}
            </div>
          ) : null}
          <div className="modal-actions">
            <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="button primary" disabled={create.isPending || !title.trim()}>
              {create.isPending ? 'Scheduling…' : 'Schedule session'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.listSessions(),
  });
  const analytics = useQuery({
    queryKey: ['workspace-analytics', '30d'],
    queryFn: () => api.getWorkspaceAnalytics(),
  });
  const exportAnalytics = useMutation({
    mutationFn: () => api.exportWorkspaceAnalytics(),
    onSuccess: (result) => downloadAnalyticsCsv(result),
  });
  const instant = useMutation({
    mutationFn: async () => {
      const now = new Date();
      const created = await api.createSession({
        title: `Instant session · ${new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(now)}`,
        kind: 'MEETING',
        startsAt: now.toISOString(),
        durationMinutes: 60,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        recordingEnabled: false,
        transcriptionEnabled: false,
      });
      return api.transitionSession(created.id, created.version, 'start');
    },
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
      navigate(`/sessions/${created.id}`);
    },
  });
  const items = sessions.data?.items ?? [];
  const upcoming = items.filter((item) => ['DRAFT', 'SCHEDULED', 'LIVE'].includes(item.status));

  return (
    <>
      <section className="page-heading">
        <div>
          <span className="eyebrow">{new Intl.DateTimeFormat('en', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</span>
          <h1>Make every session count.</h1>
          <p>Plan the flow, bring the right content, and keep one reliable record of what happened.</p>
        </div>
        <div className="heading-actions">
          <button className="button secondary" onClick={() => instant.mutate()} disabled={instant.isPending}>{instant.isPending ? 'Starting…' : 'Start instant'}</button>
          <button className="button primary" onClick={() => setDialogOpen(true)}>＋ New session</button>
        </div>
      </section>

      <section className="metric-grid" aria-label="Workspace metrics">
        <article className="metric-card accent-card">
          <span className="metric-icon">◷</span>
          <div><strong>{upcoming.length}</strong><span>Upcoming sessions</span></div>
          <small>Across this workspace</small>
        </article>
        <article className="metric-card">
          <span className="metric-icon">◉</span>
          <div><strong>{items.filter((item) => item.status === 'LIVE').length}</strong><span>Live now</span></div>
          <small>Host controls are protected</small>
        </article>
        <article className="metric-card">
          <span className="metric-icon">◇</span>
          <div><strong>{analytics.data?.overview.uniqueAttendees ?? 0}</strong><span>Unique attendees</span></div>
          <small>Last 30 days</small>
        </article>
        <article className="metric-card">
          <span className="metric-icon">↗</span>
          <div><strong>{analytics.data?.overview.engagementEvents ?? 0}</strong><span>Engagement events</span></div>
          <small>{analytics.data ? `${analytics.data.overview.eventAttendanceRate}% event attendance` : 'Loading workspace analytics'}</small>
        </article>
      </section>

      <section className="dashboard-grid">
        <div className="panel sessions-panel">
          <div className="panel-header">
            <div><span className="eyebrow">Schedule</span><h2>Upcoming sessions</h2></div>
            <button className="text-button" onClick={() => setDialogOpen(true)}>Create session</button>
          </div>
          {sessions.isLoading ? <div className="empty-state">Loading workspace…</div> : null}
          {sessions.error ? (
            <div className="error-banner">
              {sessions.error instanceof Error ? sessions.error.message : 'Unable to load sessions'}
            </div>
          ) : null}
          {!sessions.isLoading && !sessions.error && upcoming.length === 0 ? (
            <div className="empty-state spacious">
              <div className="empty-illustration">✦</div>
              <h3>Your next great meeting starts with a clear plan.</h3>
              <p>Create the first session, then build its agenda and open the media stage.</p>
              <button className="button primary" onClick={() => setDialogOpen(true)}>Create first session</button>
            </div>
          ) : null}
          <div className="session-list">
            {upcoming.map((session) => (
              <Link className="session-row" to={`/sessions/${session.id}`} key={session.id}>
                <div className="date-tile">
                  <strong>{new Date(session.startsAt).getDate()}</strong>
                  <span>{new Intl.DateTimeFormat(undefined, { month: 'short' }).format(new Date(session.startsAt))}</span>
                </div>
                <div className="session-summary">
                  <div className="session-title-line">
                    <h3>{session.title}</h3>
                    <span className={statusClass(session.status)}>{session.status.toLowerCase()}</span>
                  </div>
                  <p>{formatSessionTime(session.startsAt)} · {session.durationMinutes} min</p>
                  <div className="mini-tags">
                    <span>{session.kind === 'WEBINAR' ? 'Webinar' : 'Meeting'}</span>
                    {session.transcriptionEnabled ? <span>Transcript requested</span> : null}
                    {session.recordingEnabled ? <span>Recording requested</span> : null}
                  </div>
                </div>
                <span className="row-arrow">→</span>
              </Link>
            ))}
          </div>
        </div>

        <aside className="right-stack">
          <section className="panel copilot-panel">
            <span className="eyebrow light">Preparation assistant</span>
            <h2>Turn a topic into an agenda.</h2>
            <p>The provider-safe AI workflow is planned after transcripts, consent, and review controls are complete.</p>
            <button className="button ghost" disabled>Generate agenda · coming later</button>
          </section>
          <section className="panel readiness-panel">
            <div className="panel-header compact"><h2>Delivery readiness</h2><span className="live-dot">Live</span></div>
            <ul className="readiness-list">
              <li><span className="check done">✓</span><div><strong>Tenant-safe data path</strong><small>JWT context and forced RLS</small></div></li>
              <li><span className="check done">✓</span><div><strong>Durable commands</strong><small>Idempotency, audit, outbox</small></div></li>
              <li><span className="check active">2</span><div><strong>Meeting reliability</strong><small>LiveKit stage and device qualification</small></div></li>
              <li><span className="check">3</span><div><strong>Memory pipeline</strong><small>Recording, transcript, search, AI</small></div></li>
            </ul>
          </section>
        </aside>
      </section>

      <section className="panel workspace-analytics-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Workspace analytics</span>
            <h2>Performance · last 30 days</h2>
          </div>
          <button
            className="button secondary"
            type="button"
            disabled={exportAnalytics.isPending}
            onClick={() => exportAnalytics.mutate()}
          >
            {exportAnalytics.isPending ? 'Preparing export…' : 'Export CSV'}
          </button>
        </div>
        {analytics.isLoading ? <div className="empty-state">Loading analytics…</div> : null}
        {analytics.error ? <div className="error-banner">{analytics.error.message}</div> : null}
        {exportAnalytics.error ? <div className="error-banner">{exportAnalytics.error.message}</div> : null}
        {analytics.data ? (
          <>
            <div className="analytics-summary-grid">
              <article><span>Sessions</span><strong>{analytics.data.overview.sessions}</strong><small>{analytics.data.overview.completedSessions} completed</small></article>
              <article><span>Attendance time</span><strong>{Math.round(analytics.data.overview.totalAttendanceSeconds / 3600)}h</strong><small>{analytics.data.overview.uniqueAttendees} unique attendees</small></article>
              <article><span>Event registrations</span><strong>{analytics.data.overview.eventRegistrations}</strong><small>{analytics.data.overview.eventAttendanceRate}% attendance</small></article>
              <article><span>Bookings</span><strong>{analytics.data.overview.bookings}</strong><small>{analytics.data.overview.bookingConversionRate}% confirmed/completed</small></article>
            </div>
            <div className="analytics-table-wrap">
              <table className="analytics-table">
                <thead><tr><th>Top session</th><th>Attendees</th><th>Attendance</th><th>Engagement</th></tr></thead>
                <tbody>
                  {analytics.data.topSessions.map((item) => (
                    <tr key={item.id}>
                      <td><Link to={`/sessions/${item.id}`}>{item.title}</Link><small>{formatSessionTime(item.startsAt)}</small></td>
                      <td>{item.uniqueAttendees}</td>
                      <td>{Math.round(item.attendanceSeconds / 60)} min</td>
                      <td>{item.engagementEvents}</td>
                    </tr>
                  ))}
                  {analytics.data.topSessions.length === 0 ? <tr><td colSpan={4}>No sessions in this analytics window.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </section>

      {dialogOpen ? <CreateSessionDialog onClose={() => setDialogOpen(false)} /> : null}
    </>
  );
}
