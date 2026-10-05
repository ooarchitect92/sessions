import '@livekit/components-styles';
import { LiveKitRoom, VideoConference } from '@livekit/components-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type AgendaDraft, type MediaToken } from '../api/client';
import { AgendaContentStage } from '../components/AgendaContentStage';
import { SessionCollaborationPanel } from '../components/SessionCollaborationPanel';
import { useSessionRealtime } from '../hooks/use-session-realtime';

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function SessionPage() {
  const { sessionId = '' } = useParams();
  const queryClient = useQueryClient();
  const [media, setMedia] = useState<MediaToken | null>(null);
  const [agendaEditorOpen, setAgendaEditorOpen] = useState(false);
  const [aiAgendaOpen, setAiAgendaOpen] = useState(false);
  const [aiObjective, setAiObjective] = useState('');
  const [aiAudience, setAiAudience] = useState('');
  const [agendaDraft, setAgendaDraft] = useState<AgendaDraft | null>(null);
  const [agendaTitle, setAgendaTitle] = useState('');
  const [agendaDuration, setAgendaDuration] = useState(10);
  const [agendaUrl, setAgendaUrl] = useState('');
  const [agendaText, setAgendaText] = useState('');
  const [showSharedContent, setShowSharedContent] = useState(true);
  const [agendaType, setAgendaType] = useState<
    | 'TEXT'
    | 'PRESENTATION'
    | 'WEBSITE'
    | 'VIDEO'
    | 'POLL'
    | 'WHITEBOARD'
    | 'BREAKOUT'
    | 'QA'
    | 'SCREEN_SHARE'
  >('TEXT');
  useSessionRealtime(sessionId);

  const session = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => api.getSession(sessionId),
    enabled: Boolean(sessionId),
  });

  const recordingConsent = useQuery({
    queryKey: ['recording-consent', sessionId],
    queryFn: () => api.getRecordingConsent(sessionId),
    enabled: Boolean(sessionId && session.data?.recordingEnabled),
  });

  const updateRecordingConsent = useMutation({
    mutationFn: (decision: 'GRANTED' | 'DECLINED' | 'REVOKED') => {
      const status = recordingConsent.data;
      return api.recordRecordingConsent(
        sessionId,
        decision,
        status?.policyVersion ?? 'recording-policy-v1',
        status?.noticeVersion ?? 'recording-notice-v1',
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['recording-consent', sessionId],
      });
    },
  });

  const transition = useMutation({
    mutationFn: (action: 'start' | 'end' | 'cancel') => {
      if (!session.data) throw new Error('Session is unavailable');
      return api.transitionSession(sessionId, session.data.version, action);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
      await queryClient.invalidateQueries({ queryKey: ['sessions'] });
      await queryClient.invalidateQueries({ queryKey: ['memory'] });
    },
  });

  const join = useMutation({
    mutationFn: () => api.createMediaToken(sessionId),
    onSuccess: setMedia,
  });

  const activate = useMutation({
    mutationFn: (agendaItemId: string) => api.activateAgendaItem(sessionId, agendaItemId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
    },
  });

  const createAgendaItem = useMutation({
    mutationFn: () =>
      api.createAgendaItem(sessionId, {
        title: agendaTitle,
        durationSeconds: agendaDuration * 60,
        type: agendaType,
        content:
          agendaType === 'TEXT'
            ? { text: agendaText.trim() }
            : ['WEBSITE', 'PRESENTATION', 'VIDEO'].includes(agendaType)
              ? { url: agendaUrl.trim() }
              : {},
      }),
    onSuccess: async () => {
      setAgendaTitle('');
      setAgendaDuration(10);
      setAgendaUrl('');
      setAgendaText('');
      setAgendaType('TEXT');
      setAgendaEditorOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
    },
  });

  const generateAgendaDraft = useMutation({
    mutationFn: () =>
      api.generateAgendaDraft(sessionId, {
        ...(aiObjective.trim() ? { objective: aiObjective.trim() } : {}),
        ...(aiAudience.trim() ? { audience: aiAudience.trim() } : {}),
        ...(session.data?.durationMinutes
          ? { durationMinutes: session.data.durationMinutes }
          : {}),
      }),
    onSuccess: (draft) => {
      setAgendaDraft(draft);
    },
  });

  const applyAgendaDraft = useMutation({
    mutationFn: () => {
      if (!agendaDraft) throw new Error('Generate an agenda draft first');
      return api.applyAgendaDraft(sessionId, agendaDraft.items);
    },
    onSuccess: async () => {
      setAgendaDraft(null);
      setAiObjective('');
      setAiAudience('');
      setAiAgendaOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
    },
  });

  const submitAgendaItem = (event: FormEvent) => {
    event.preventDefault();
    createAgendaItem.mutate();
  };

  if (session.isLoading) return <div className="full-page-state">Loading session…</div>;
  if (session.error || !session.data) {
    return (
      <div className="full-page-state error-state">
        <h1>Session unavailable</h1>
        <p>
          {session.error instanceof Error
            ? session.error.message
            : 'The session could not be loaded.'}
        </p>
        <Link to="/" className="button secondary">
          Return to overview
        </Link>
      </div>
    );
  }

  const current = session.data;
  const canStart = ['DRAFT', 'SCHEDULED'].includes(current.status);
  const canEnd = current.status === 'LIVE';
  const consentGranted =
    !current.recordingEnabled ||
    recordingConsent.data?.currentDecision === 'GRANTED';
  const activeAgendaItem =
    current.agendaItems.find((item) => item.id === current.currentAgendaItemId) ?? null;
  const activeHasSharedContent =
    activeAgendaItem !== null &&
    (activeAgendaItem.type === 'TEXT' ||
      ['WEBSITE', 'PRESENTATION', 'VIDEO'].includes(activeAgendaItem.type));

  return (
    <div className="session-workspace">
      <header className="session-header">
        <div className="session-header-title">
          <Link to="/" className="back-link" aria-label="Back to overview">
            ←
          </Link>
          <div>
            <div className="session-kicker">
              <span className={`status-badge status-${current.status.toLowerCase()}`}>
                {current.status.toLowerCase()}
              </span>
              <span>{formatTime(current.startsAt)}</span>
            </div>
            <h1>{current.title}</h1>
          </div>
        </div>
        <div className="session-header-actions">
          {canStart ? (
            <button
              className="button secondary"
              onClick={() => transition.mutate('start')}
              disabled={transition.isPending}
            >
              Start session
            </button>
          ) : null}
          {canEnd ? (
            <button
              className="button danger"
              onClick={() => transition.mutate('end')}
              disabled={transition.isPending}
            >
              End session
            </button>
          ) : null}
          <button
            className="button primary"
            onClick={() => join.mutate()}
            disabled={join.isPending || !consentGranted}
          >
            {!consentGranted
              ? 'Recording consent required'
              : join.isPending
                ? 'Opening stage…'
                : media
                  ? 'Reconnect media'
                  : 'Join media stage'}
          </button>
        </div>
      </header>

      {current.recordingEnabled ? (
        <section className="recording-consent-banner" aria-live="polite">
          <div>
            <span className="recording-dot" aria-hidden="true" />
            <strong>This session is configured for cloud recording.</strong>
            <p>
              Recording may include audio, video, screen sharing, chat, polls, and
              agenda activity. A consent decision is required before media access is
              issued.
            </p>
          </div>
          <div className="recording-consent-actions">
            <button
              className="button primary"
              type="button"
              disabled={updateRecordingConsent.isPending}
              onClick={() => updateRecordingConsent.mutate('GRANTED')}
            >
              {recordingConsent.data?.currentDecision === 'GRANTED'
                ? 'Consent granted'
                : 'I consent'}
            </button>
            <button
              className="button secondary"
              type="button"
              disabled={updateRecordingConsent.isPending}
              onClick={() => updateRecordingConsent.mutate('DECLINED')}
            >
              Decline
            </button>
          </div>
          {recordingConsent.data?.currentDecision === 'DECLINED' ? (
            <small>
              You declined recording. Media access remains blocked until you grant
              consent.
            </small>
          ) : null}
          {updateRecordingConsent.error ? (
            <div className="error-banner compact-error">
              {updateRecordingConsent.error.message}
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="meeting-layout">
        <aside className="agenda-rail">
          <div className="rail-heading">
            <span className="eyebrow">Run of show</span>
            <div className="rail-title-row">
              <h2>Agenda</h2>
              <div className="agenda-heading-actions">
                <button
                  className="agenda-ai-button"
                  type="button"
                  onClick={() => setAiAgendaOpen((value) => !value)}
                  aria-expanded={aiAgendaOpen}
                >
                  AI
                </button>
                <button
                  className="agenda-add-button"
                  type="button"
                  onClick={() => setAgendaEditorOpen((value) => !value)}
                  aria-expanded={agendaEditorOpen}
                >
                  {agendaEditorOpen ? '×' : '+'}
                </button>
              </div>
            </div>
            <span>{current.agendaItems.length} items</span>
          </div>
          {aiAgendaOpen ? (
            <section className="agenda-ai-panel">
              <span className="eyebrow">AI copilot</span>
              <h3>Draft a reviewable agenda</h3>
              <p>
                AI suggestions are not saved until you review and apply them.
              </p>
              <label>
                Objective
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={aiObjective}
                  onChange={(event) => setAiObjective(event.target.value)}
                  placeholder="Align on launch scope and assign owners"
                />
              </label>
              <label>
                Audience
                <input
                  maxLength={1000}
                  value={aiAudience}
                  onChange={(event) => setAiAudience(event.target.value)}
                  placeholder="Product, engineering, and marketing"
                />
              </label>
              <button
                className="button secondary full-width"
                type="button"
                disabled={generateAgendaDraft.isPending}
                onClick={() => generateAgendaDraft.mutate()}
              >
                {generateAgendaDraft.isPending ? 'Generating…' : 'Generate draft'}
              </button>
              {generateAgendaDraft.error ? (
                <div className="error-banner">
                  {generateAgendaDraft.error.message}
                </div>
              ) : null}
              {agendaDraft ? (
                <div className="agenda-ai-draft">
                  <div className="agenda-ai-draft-heading">
                    <strong>
                      {agendaDraft.items.length} suggested items ·{' '}
                      {Math.round(agendaDraft.totalDurationSeconds / 60)} min
                    </strong>
                    <small>
                      {agendaDraft.provider} / {agendaDraft.model}
                    </small>
                  </div>
                  <ol>
                    {agendaDraft.items.map((item, index) => (
                      <li key={`${item.title}-${index}`}>
                        <strong>{item.title}</strong>
                        <span>
                          {Math.round(item.durationSeconds / 60)} min ·{' '}
                          {item.type.toLowerCase().replace('_', ' ')}
                        </span>
                        {item.rationale ? <p>{item.rationale}</p> : null}
                      </li>
                    ))}
                  </ol>
                  <div className="agenda-ai-draft-actions">
                    <button
                      className="button primary"
                      type="button"
                      disabled={applyAgendaDraft.isPending}
                      onClick={() => applyAgendaDraft.mutate()}
                    >
                      {applyAgendaDraft.isPending ? 'Applying…' : 'Apply reviewed draft'}
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      disabled={applyAgendaDraft.isPending}
                      onClick={() => setAgendaDraft(null)}
                    >
                      Discard
                    </button>
                  </div>
                  {applyAgendaDraft.error ? (
                    <div className="error-banner">
                      {applyAgendaDraft.error.message}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}
          {agendaEditorOpen ? (
            <form className="agenda-inline-form" onSubmit={submitAgendaItem}>
              <label>
                Agenda item
                <input
                  autoFocus
                  required
                  maxLength={160}
                  value={agendaTitle}
                  onChange={(event) => setAgendaTitle(event.target.value)}
                  placeholder="Product walkthrough"
                />
              </label>
              <div className="agenda-form-grid">
                <label>
                  Minutes
                  <input
                    type="number"
                    min={0}
                    max={1440}
                    value={agendaDuration}
                    onChange={(event) => setAgendaDuration(Number(event.target.value))}
                  />
                </label>
                <label>
                  Content
                  <select
                    value={agendaType}
                    onChange={(event) => {
                      const nextType = event.target.value as typeof agendaType;
                      setAgendaType(nextType);
                      if (!['WEBSITE', 'PRESENTATION', 'VIDEO'].includes(nextType)) {
                        setAgendaUrl('');
                      }
                      if (nextType !== 'TEXT') setAgendaText('');
                    }}
                  >
                    <option value="TEXT">Discussion</option>
                    <option value="PRESENTATION">Presentation</option>
                    <option value="WEBSITE">Website</option>
                    <option value="VIDEO">Video</option>
                    <option value="POLL">Poll</option>
                    <option value="WHITEBOARD">Whiteboard</option>
                    <option value="BREAKOUT">Breakout</option>
                    <option value="QA">Q&amp;A</option>
                    <option value="SCREEN_SHARE">Screen share</option>
                  </select>
                </label>
              </div>
              {['WEBSITE', 'PRESENTATION', 'VIDEO'].includes(agendaType) ? (
                <label>
                  HTTPS content URL
                  <input
                    type="url"
                    required
                    value={agendaUrl}
                    onChange={(event) => setAgendaUrl(event.target.value)}
                    placeholder={
                      agendaType === 'VIDEO'
                        ? 'https://www.youtube.com/watch?v=…'
                        : 'https://example.com/shared-content'
                    }
                  />
                  <small>
                    External content is rendered in a restricted sandboxed frame.
                  </small>
                </label>
              ) : null}
              {agendaType === 'TEXT' ? (
                <label>
                  Shared notes
                  <textarea
                    rows={4}
                    maxLength={20000}
                    value={agendaText}
                    onChange={(event) => setAgendaText(event.target.value)}
                    placeholder="Discussion context, prompts, or talking points"
                  />
                </label>
              ) : null}
              {createAgendaItem.error ? (
                <div className="error-banner">{createAgendaItem.error.message}</div>
              ) : null}
              <button
                className="button primary full-width"
                disabled={createAgendaItem.isPending || !agendaTitle.trim()}
              >
                {createAgendaItem.isPending ? 'Adding…' : 'Add agenda item'}
              </button>
            </form>
          ) : null}
          {current.agendaItems.length === 0 ? (
            <div className="rail-empty">
              <span>◎</span>
              <p>No agenda items yet.</p>
              <small>Add the first item to create a shared run of show.</small>
            </div>
          ) : (
            <ol className="agenda-list">
              {current.agendaItems.map((item) => {
                const active = current.currentAgendaItemId === item.id;
                return (
                  <li key={item.id} className={active ? 'agenda-item active' : 'agenda-item'}>
                    <button
                      onClick={() => activate.mutate(item.id)}
                      disabled={activate.isPending}
                    >
                      <span className="agenda-index">{item.position + 1}</span>
                      <span className="agenda-copy">
                        <strong>{item.title}</strong>
                        <small>
                          {Math.round(item.durationSeconds / 60)} min ·{' '}
                          {item.type.toLowerCase().replace('_', ' ')}
                        </small>
                      </span>
                      {active ? <span className="now-pill">Now</span> : null}
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </aside>

        <section className="meeting-stage">
          {activeHasSharedContent && showSharedContent && activeAgendaItem ? (
            <AgendaContentStage
              item={activeAgendaItem}
              onShowMedia={() => setShowSharedContent(false)}
            />
          ) : media ? (
            <LiveKitRoom
              token={media.token}
              serverUrl={media.url}
              connect
              audio
              video
              data-lk-theme="default"
              onDisconnected={() => setMedia(null)}
            >
              <VideoConference />
            </LiveKitRoom>
          ) : (
            <div className="stage-placeholder">
              <div className="stage-orbit">
                <span>S</span>
              </div>
              <span className="eyebrow">Secure media stage</span>
              <h2>Ready when your participants are.</h2>
              <p>
                Joining requests a short-lived, room-scoped token from the backend. LiveKit
                handles camera, microphone, screen sharing, adaptive subscriptions, and
                reconnect behavior.
              </p>
              {activeHasSharedContent ? (
                <button
                  className="button secondary large"
                  type="button"
                  onClick={() => setShowSharedContent(true)}
                >
                  Show shared agenda content
                </button>
              ) : null}
              <button
                className="button primary large"
                onClick={() => join.mutate()}
                disabled={join.isPending || !consentGranted}
              >
                {!consentGranted
                  ? 'Grant consent to join'
                  : join.isPending
                    ? 'Preparing room…'
                    : 'Check devices and join'}
              </button>
              {join.error ? (
                <div className="error-banner compact-error">{join.error.message}</div>
              ) : null}
            </div>
          )}
        </section>

        <SessionCollaborationPanel sessionId={sessionId} />
      </div>
    </div>
  );
}
