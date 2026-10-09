import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateSessionInput, Session } from '@sessions/contracts';
import { FormEvent, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';

function formatSessionTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
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
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.listSessions(),
  });
  const canViewAnalytics = auth.me?.principal.roles.some((role) =>
    ['OWNER', 'ADMIN', 'HOST', 'ANALYST'].includes(role),
  ) ?? false;
  const analytics = useQuery({
    queryKey: ['workspace-analytics', 'dashboard'],
    queryFn: () => api.getWorkspaceAnalytics(),
    enabled: canViewAnalytics,
  });
  const exportAnalytics = useMutation({
    mutationFn: () => api.exportWorkspaceAnalytics(),
    onSuccess: (result) => {
      const blob = new Blob([result.csv], { type: result.contentType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    },
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
          {canViewAnalytics ? (
            <button
              className="button secondary"
              onClick={() => exportAnalytics.mutate()}
              disabled={exportAnalytics.isPending}
            >
              {exportAnalytics.isPending ? 'Exporting…' : 'Export 30d metrics'}
            </button>
          ) : null}
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
          <div>
            <strong>{canViewAnalytics ? (analytics.data?.totals.sessionsScheduled ?? 0) : '—'}</strong>
            <span>Sessions · 30d</span>
          </div>
          <small>
            {canViewAnalytics
              ? `${analytics.data?.totals.uniqueAttendees ?? 0} daily attendee appearances`
              : 'Host or analyst access required'}
          </small>
        </article>
        <article className="metric-card">
          <span className="metric-icon">↗</span>
          <div>
            <strong>{canViewAnalytics ? (analytics.data?.totals.engagementEvents ?? 0) : '—'}</strong>
            <span>Engagement · 30d</span>
          </div>
          <small>
            {canViewAnalytics
              ? `${Math.round((analytics.data?.totals.attendanceSeconds ?? 0) / 3600)} attendance hours`
              : 'Aggregate metrics are role governed'}
          </small>
        </article>
      </section>

      {exportAnalytics.error ? (
        <div className="error-banner">{exportAnalytics.error.message}</div>
      ) : null}

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

      {dialogOpen ? <CreateSessionDialog onClose={() => setDialogOpen(false)} /> : null}
    </>
  );
}
