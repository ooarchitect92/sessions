import '@livekit/components-styles';
import { LiveKitRoom, VideoConference } from '@livekit/components-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type GeneratedAgenda, type MediaToken } from '../api/client';
import { AgendaContentStage } from '../components/AgendaContentStage';
import {
  DevicePreflight,
  type MediaJoinPreferences,
} from '../components/DevicePreflight';
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
  const [mediaRoomKey, setMediaRoomKey] = useState('main');
  const [mediaRoomLabel, setMediaRoomLabel] = useState('Main room');
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [mediaPreferences, setMediaPreferences] = useState<MediaJoinPreferences>({
    audioEnabled: true,
    videoEnabled: true,
  });
  const [agendaEditorOpen, setAgendaEditorOpen] = useState(false);
  const [agendaAiOpen, setAgendaAiOpen] = useState(false);
  const [agendaTemplatesOpen, setAgendaTemplatesOpen] = useState(false);
  const [agendaTemplateName, setAgendaTemplateName] = useState('');
  const [agendaTemplateDescription, setAgendaTemplateDescription] = useState('');
  const [agendaObjective, setAgendaObjective] = useState('');
  const [agendaDesiredItems, setAgendaDesiredItems] = useState(5);
  const [generatedAgenda, setGeneratedAgenda] = useState<GeneratedAgenda | null>(null);
  const [agendaTitle, setAgendaTitle] = useState('');
  const [agendaDuration, setAgendaDuration] = useState(10);
  const [agendaUrl, setAgendaUrl] = useState('');
  const [agendaText, setAgendaText] = useState('');
  const [agendaFileId, setAgendaFileId] = useState('');
  const [agendaFile, setAgendaFile] = useState<File | null>(null);
  const [timerClock, setTimerClock] = useState(() => Date.now());
  const [agendaType, setAgendaType] = useState<
    | 'TEXT'
    | 'PRESENTATION'
    | 'WEBSITE'
    | 'VIDEO'
    | 'FILE'
    | 'POLL'
    | 'WHITEBOARD'
    | 'BREAKOUT'
    | 'QA'
    | 'SCREEN_SHARE'
  >('TEXT');
  const realtime = useSessionRealtime(sessionId);

  const session = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => api.getSession(sessionId),
    enabled: Boolean(sessionId),
  });

  const authMe = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => api.authMe(),
  });

  const sessionFiles = useQuery({
    queryKey: ['session-files', sessionId],
    queryFn: () => api.listSessionFiles(sessionId),
    enabled: Boolean(sessionId),
    refetchInterval: (query) => {
      const files = query.state.data;
      return files?.some((file) =>
        ['PENDING_UPLOAD', 'QUARANTINED', 'SCANNING'].includes(file.status),
      )
        ? 2500
        : false;
    },
  });

  const agendaTemplates = useQuery({
    queryKey: ['agenda-templates'],
    queryFn: () => api.listAgendaTemplates(),
    enabled: agendaTemplatesOpen,
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
    onSuccess: (token) => {
      setMediaRoomKey('main');
      setMediaRoomLabel('Main room');
      setMedia(token);
      setPreflightOpen(false);
    },
  });

  const joinBreakout = useMutation({
    mutationFn: (breakoutRoomId: string) =>
      api.createBreakoutMediaToken(sessionId, breakoutRoomId),
    onSuccess: (token, breakoutRoomId) => {
      setMediaRoomKey(`breakout:${breakoutRoomId}`);
      setMediaRoomLabel('Breakout room');
      setMedia(token);
    },
  });

  const returnToMain = useMutation({
    mutationFn: () => api.createMediaToken(sessionId),
    onSuccess: (token) => {
      setMediaRoomKey('main');
      setMediaRoomLabel('Main room');
      setMedia(token);
    },
  });

  const uploadAgendaFile = useMutation({
    mutationFn: async () => {
      if (!agendaFile) throw new Error('Choose a file to upload');
      return api.uploadSessionFile(sessionId, agendaFile);
    },
    onSuccess: async (file) => {
      setAgendaFile(null);
      setAgendaFileId(file.id);
      await queryClient.invalidateQueries({
        queryKey: ['session-files', sessionId],
      });
    },
  });

  const saveAgendaTemplate = useMutation({
    mutationFn: () =>
      api.saveAgendaTemplate(sessionId, {
        name: agendaTemplateName,
        ...(agendaTemplateDescription.trim()
          ? { description: agendaTemplateDescription.trim() }
          : {}),
      }),
    onSuccess: async () => {
      setAgendaTemplateName('');
      setAgendaTemplateDescription('');
      await queryClient.invalidateQueries({ queryKey: ['agenda-templates'] });
    },
  });

  const applyAgendaTemplate = useMutation({
    mutationFn: (templateId: string) =>
      api.applyAgendaTemplate(sessionId, templateId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
      await queryClient.invalidateQueries({ queryKey: ['agenda-templates'] });
    },
  });

  const deleteAgendaTemplate = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      api.deleteAgendaTemplate(id, version),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['agenda-templates'] });
    },
  });

  const controlAgendaTimer = useMutation({
    mutationFn: (action: 'START' | 'PAUSE' | 'RESET') =>
      api.controlAgendaTimer(sessionId, action),
    onSuccess: async () => {
      setTimerClock(Date.now());
      await queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
    },
  });

  const activate = useMutation({
    mutationFn: (agendaItemId: string) => api.activateAgendaItem(sessionId, agendaItemId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
    },
  });

  const generateAgenda = useMutation({
    mutationFn: () =>
      api.generateAgenda(sessionId, {
        objective: agendaObjective,
        desiredItems: agendaDesiredItems,
      }),
    onSuccess: (result) => setGeneratedAgenda(result),
  });

  const applyGeneratedAgenda = useMutation({
    mutationFn: async () => {
      if (!generatedAgenda) return;
      for (const item of generatedAgenda.items) {
        await api.createAgendaItem(sessionId, {
          title: item.title,
          durationSeconds: item.durationSeconds,
          type: item.type,
          content: item.notes ? { text: item.notes } : {},
        });
      }
    },
    onSuccess: async () => {
      setGeneratedAgenda(null);
      setAgendaAiOpen(false);
      setAgendaObjective('');
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
            ? { text: agendaText }
            : ['WEBSITE', 'PRESENTATION', 'VIDEO'].includes(agendaType)
              ? { url: agendaUrl }
              : {},
      }),
    onSuccess: async () => {
      setAgendaTitle('');
      setAgendaDuration(10);
      setAgendaUrl('');
      setAgendaText('');
      setAgendaFileId('');
      setAgendaFile(null);
      setAgendaType('TEXT');
      setAgendaEditorOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
    },
  });

  const submitAgendaItem = (event: FormEvent) => {
    event.preventDefault();
    createAgendaItem.mutate();
  };

  useEffect(() => {
    const timer = session.data;
    if (
      timer?.agendaTimerStatus !== 'RUNNING' ||
      !timer.agendaTimerEndsAt
    ) {
      return;
    }

    setTimerClock(Date.now());
    const interval = window.setInterval(() => setTimerClock(Date.now()), 500);
    return () => window.clearInterval(interval);
  }, [session.data?.agendaTimerEndsAt, session.data?.agendaTimerStatus]);

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
  const showsSharedContent =
    activeAgendaItem !== null &&
    ['TEXT', 'WEBSITE', 'PRESENTATION', 'VIDEO', 'FILE'].includes(activeAgendaItem.type);
  const canControlAgenda =
    authMe.data?.principal.roles.some((role) =>
      ['OWNER', 'ADMIN', 'HOST'].includes(role),
    ) ?? false;
  const timerRemainingSeconds =
    current.agendaTimerStatus === 'RUNNING' && current.agendaTimerEndsAt
      ? Math.max(
          0,
          Math.ceil(
            (new Date(current.agendaTimerEndsAt).getTime() - timerClock) / 1000,
          ),
        )
      : current.agendaTimerRemainingSeconds;
  const timerStatus =
    current.agendaTimerStatus === 'RUNNING' && timerRemainingSeconds === 0
      ? 'EXPIRED'
      : current.agendaTimerStatus;
  const timerMinutes = Math.floor(timerRemainingSeconds / 60);
  const timerSeconds = timerRemainingSeconds % 60;

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
            onClick={() => setPreflightOpen(true)}
            disabled={join.isPending || !consentGranted}
          >
            {!consentGranted
              ? 'Recording consent required'
              : join.isPending
                ? 'Opening stage…'
                : media
                  ? 'Reconnect media'
                  : 'Check devices & join'}
          </button>
        </div>
      </header>

      {realtime.breakoutNotice ? (
        <div className="breakout-broadcast-banner" role="status">
          <strong>Breakout broadcast</strong>
          <span>{realtime.breakoutNotice}</span>
        </div>
      ) : null}

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

      {preflightOpen ? (
        <DevicePreflight
          busy={join.isPending}
          error={join.error instanceof Error ? join.error.message : null}
          onCancel={() => {
            if (!join.isPending) setPreflightOpen(false);
          }}
          onJoin={(preferences) => {
            setMediaPreferences(preferences);
            join.mutate();
          }}
        />
      ) : null}

      <div className="meeting-layout">
        <aside className="agenda-rail">
          <div className="rail-heading">
            <span className="eyebrow">Run of show</span>
            <div className="rail-title-row">
              <h2>Agenda</h2>
              <div className="agenda-rail-actions">
                <button
                  className="agenda-ai-button"
                  type="button"
                  onClick={() => {
                    setAgendaTemplatesOpen((value) => !value);
                    setAgendaAiOpen(false);
                    setAgendaEditorOpen(false);
                  }}
                  aria-expanded={agendaTemplatesOpen}
                >
                  Tpl
                </button>
                <button
                  className="agenda-ai-button"
                  type="button"
                  onClick={() => {
                    setAgendaAiOpen((value) => !value);
                    setAgendaTemplatesOpen(false);
                    setAgendaEditorOpen(false);
                  }}
                  aria-expanded={agendaAiOpen}
                >
                  AI
                </button>
                <button
                  className="agenda-add-button"
                  type="button"
                  onClick={() => {
                    setAgendaEditorOpen((value) => !value);
                    setAgendaAiOpen(false);
                    setAgendaTemplatesOpen(false);
                  }}
                  aria-expanded={agendaEditorOpen}
                >
                  {agendaEditorOpen ? '×' : '+'}
                </button>
              </div>
            </div>
            <span>{current.agendaItems.length} items</span>
          </div>
          {activeAgendaItem ? (
            <section
              className={`agenda-timer-card agenda-timer-${timerStatus.toLowerCase()}`}
              aria-live="polite"
            >
              <div className="agenda-timer-heading">
                <div>
                  <span className="eyebrow">Current item</span>
                  <strong>{activeAgendaItem.title}</strong>
                </div>
                <span className="agenda-timer-status">{timerStatus.toLowerCase()}</span>
              </div>
              <div className="agenda-timer-display">
                {String(timerMinutes).padStart(2, '0')}:
                {String(timerSeconds).padStart(2, '0')}
              </div>
              <div className="agenda-timer-meta">
                <span>
                  Planned {Math.max(0, Math.round(activeAgendaItem.durationSeconds / 60))} min
                </span>
                {current.agendaTimerStartedAt ? (
                  <span>Host timer synchronized</span>
                ) : (
                  <span>Ready to start</span>
                )}
              </div>
              {canControlAgenda ? (
                <div className="agenda-timer-actions">
                  <button
                    type="button"
                    disabled={
                      controlAgendaTimer.isPending ||
                      timerStatus === 'RUNNING' ||
                      activeAgendaItem.durationSeconds === 0
                    }
                    onClick={() => controlAgendaTimer.mutate('START')}
                  >
                    {timerStatus === 'PAUSED' ? 'Resume' : 'Start'}
                  </button>
                  <button
                    type="button"
                    disabled={
                      controlAgendaTimer.isPending || timerStatus !== 'RUNNING'
                    }
                    onClick={() => controlAgendaTimer.mutate('PAUSE')}
                  >
                    Pause
                  </button>
                  <button
                    type="button"
                    disabled={controlAgendaTimer.isPending}
                    onClick={() => controlAgendaTimer.mutate('RESET')}
                  >
                    Reset
                  </button>
                </div>
              ) : (
                <small className="agenda-timer-viewer-note">
                  Timer controls are available to hosts.
                </small>
              )}
              {controlAgendaTimer.error ? (
                <div className="error-banner compact-error">
                  {controlAgendaTimer.error.message}
                </div>
              ) : null}
            </section>
          ) : null}
          {agendaTemplatesOpen ? (
            <div className="agenda-template-panel">
              <span className="eyebrow">Agenda templates</span>
              <p>
                Save this agenda for reuse or append a workspace template to the session.
              </p>
              <label>
                Template name
                <input
                  maxLength={160}
                  value={agendaTemplateName}
                  onChange={(event) => setAgendaTemplateName(event.target.value)}
                  placeholder="Sales discovery"
                />
              </label>
              <label>
                Description
                <textarea
                  rows={2}
                  maxLength={1000}
                  value={agendaTemplateDescription}
                  onChange={(event) => setAgendaTemplateDescription(event.target.value)}
                  placeholder="Optional team context"
                />
              </label>
              <button
                className="button secondary full-width"
                type="button"
                disabled={
                  saveAgendaTemplate.isPending ||
                  !agendaTemplateName.trim() ||
                  current.agendaItems.length === 0
                }
                onClick={() => saveAgendaTemplate.mutate()}
              >
                {saveAgendaTemplate.isPending ? 'Saving…' : 'Save current agenda'}
              </button>
              {saveAgendaTemplate.error ? (
                <div className="error-banner">{saveAgendaTemplate.error.message}</div>
              ) : null}
              <div className="agenda-template-list">
                {agendaTemplates.isLoading ? (
                  <p>Loading templates…</p>
                ) : null}
                {agendaTemplates.data?.map((template) => (
                  <article key={template.id}>
                    <div>
                      <strong>{template.name}</strong>
                      <small>
                        {template.items.length} items · v{template.version}
                      </small>
                      {template.description ? <p>{template.description}</p> : null}
                    </div>
                    <div>
                      <button
                        type="button"
                        disabled={applyAgendaTemplate.isPending}
                        onClick={() => applyAgendaTemplate.mutate(template.id)}
                      >
                        Apply
                      </button>
                      <button
                        type="button"
                        disabled={deleteAgendaTemplate.isPending}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Delete agenda template "${template.name}"?`,
                            )
                          ) {
                            deleteAgendaTemplate.mutate({
                              id: template.id,
                              version: template.version,
                            });
                          }
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
                {agendaTemplates.data?.length === 0 ? (
                  <p>No workspace templates yet.</p>
                ) : null}
              </div>
              {applyAgendaTemplate.error || deleteAgendaTemplate.error ? (
                <div className="error-banner">
                  {(applyAgendaTemplate.error ?? deleteAgendaTemplate.error)?.message}
                </div>
              ) : null}
            </div>
          ) : null}
          {agendaAiOpen ? (
            <div className="agenda-ai-panel">
              <span className="eyebrow">AI agenda draft</span>
              <p>
                Generate a draft for review. Nothing is added until you approve it.
              </p>
              <label>
                Meeting objective
                <textarea
                  rows={4}
                  maxLength={2000}
                  value={agendaObjective}
                  onChange={(event) => setAgendaObjective(event.target.value)}
                  placeholder="Example: Align the team on launch scope, risks, owners, and next steps."
                />
              </label>
              <label>
                Suggested items
                <input
                  type="number"
                  min={2}
                  max={12}
                  value={agendaDesiredItems}
                  onChange={(event) =>
                    setAgendaDesiredItems(
                      Math.max(2, Math.min(12, Number(event.target.value) || 2)),
                    )
                  }
                />
              </label>
              <button
                className="button primary full-width"
                type="button"
                disabled={generateAgenda.isPending || agendaObjective.trim().length < 3}
                onClick={() => generateAgenda.mutate()}
              >
                {generateAgenda.isPending ? 'Generating…' : 'Generate draft'}
              </button>
              {generateAgenda.error ? (
                <div className="error-banner">{generateAgenda.error.message}</div>
              ) : null}
              {generatedAgenda ? (
                <div className="agenda-ai-preview">
                  <div className="agenda-ai-preview-heading">
                    <strong>{generatedAgenda.items.length} suggested items</strong>
                    <small>
                      {generatedAgenda.provider} · {generatedAgenda.model}
                    </small>
                  </div>
                  <ol>
                    {generatedAgenda.items.map((item, index) => (
                      <li key={`${item.title}-${index}`}>
                        <strong>{item.title}</strong>
                        <span>
                          {Math.max(1, Math.round(item.durationSeconds / 60))} min ·{' '}
                          {item.type.toLowerCase()}
                        </span>
                        {item.notes ? <p>{item.notes}</p> : null}
                      </li>
                    ))}
                  </ol>
                  <button
                    className="button primary full-width"
                    type="button"
                    disabled={applyGeneratedAgenda.isPending}
                    onClick={() => applyGeneratedAgenda.mutate()}
                  >
                    {applyGeneratedAgenda.isPending
                      ? 'Adding agenda…'
                      : 'Approve and add all'}
                  </button>
                  {applyGeneratedAgenda.error ? (
                    <div className="error-banner">{applyGeneratedAgenda.error.message}</div>
                  ) : null}
                </div>
              ) : null}
            </div>
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
                    onChange={(event) => setAgendaType(event.target.value as typeof agendaType)}
                  >
                    <option value="TEXT">Discussion</option>
                    <option value="PRESENTATION">Presentation</option>
                    <option value="WEBSITE">Website</option>
                    <option value="VIDEO">Video</option>
                    <option value="FILE">Uploaded file</option>
                    <option value="POLL">Poll</option>
                    <option value="WHITEBOARD">Whiteboard</option>
                    <option value="BREAKOUT">Breakout</option>
                    <option value="QA">Q&amp;A</option>
                    <option value="SCREEN_SHARE">Screen share</option>
                  </select>
                </label>
              </div>
              {agendaType === 'TEXT' ? (
                <label>
                  Shared note
                  <textarea
                    maxLength={20000}
                    rows={3}
                    value={agendaText}
                    onChange={(event) => setAgendaText(event.target.value)}
                    placeholder="Context or talking points visible when this item is active"
                  />
                </label>
              ) : agendaType === 'FILE' ? (
                <div className="agenda-file-picker">
                  <label>
                    Upload file for scanning
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.mp4,.webm,.docx,.pptx,.xlsx"
                      onChange={(event) =>
                        setAgendaFile(event.target.files?.[0] ?? null)
                      }
                    />
                  </label>
                  <button
                    className="button secondary full-width"
                    type="button"
                    disabled={!agendaFile || uploadAgendaFile.isPending}
                    onClick={() => uploadAgendaFile.mutate()}
                  >
                    {uploadAgendaFile.isPending
                      ? 'Uploading to quarantine…'
                      : 'Upload and scan'}
                  </button>
                  {uploadAgendaFile.error ? (
                    <div className="error-banner">
                      {uploadAgendaFile.error.message}
                    </div>
                  ) : null}
                  <label>
                    Cleared file
                    <select
                      required
                      value={agendaFileId}
                      onChange={(event) => setAgendaFileId(event.target.value)}
                    >
                      <option value="">Select a scanned file</option>
                      {sessionFiles.data?.map((file) => (
                        <option
                          key={file.id}
                          value={file.id}
                          disabled={file.status !== 'READY'}
                        >
                          {file.filename} · {file.status.toLowerCase()}
                        </option>
                      ))}
                    </select>
                  </label>
                  <small className="agenda-file-safety-note">
                    Files remain unavailable until malware scanning reports them clean.
                  </small>
                </div>
              ) : ['WEBSITE', 'PRESENTATION', 'VIDEO'].includes(agendaType) ? (
                <label>
                  HTTPS content URL
                  <input
                    type="url"
                    required
                    value={agendaUrl}
                    onChange={(event) => setAgendaUrl(event.target.value)}
                    placeholder="https://..."
                  />
                </label>
              ) : null}
              {createAgendaItem.error ? (
                <div className="error-banner">{createAgendaItem.error.message}</div>
              ) : null}
              <button
                className="button primary full-width"
                disabled={
                  createAgendaItem.isPending ||
                  !agendaTitle.trim() ||
                  (agendaType === 'FILE' && !agendaFileId)
                }
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

        <section
          className={showsSharedContent ? 'meeting-stage with-shared-content' : 'meeting-stage'}
        >
          {showsSharedContent && activeAgendaItem ? (
            <AgendaContentStage item={activeAgendaItem} />
          ) : null}
          <div className="reaction-overlay" aria-live="polite">
            {realtime.reactions.map((event) => (
              <div className="reaction-bubble" key={event.reactionId}>
                <span>{event.reaction}</span>
                <small>{event.displayName}</small>
              </div>
            ))}
          </div>
          <div className="reaction-toolbar" aria-label="Meeting reactions">
            {(['👍', '❤️', '😂', '👏', '🎉', '🙌'] as const).map((reaction) => (
              <button
                key={reaction}
                type="button"
                onClick={() => realtime.sendReaction(reaction)}
                disabled={!realtime.connected}
                aria-label={`Send ${reaction} reaction`}
              >
                {reaction}
              </button>
            ))}
          </div>
          <div className="media-stage">
          {media ? (
            <>
              <div className="media-room-context">
                <span>{mediaRoomLabel}</span>
                {mediaRoomKey !== 'main' ? (
                  <button
                    type="button"
                    disabled={returnToMain.isPending}
                    onClick={() => returnToMain.mutate()}
                  >
                    Return to main room
                  </button>
                ) : null}
              </div>
            <LiveKitRoom
              key={mediaRoomKey}
              token={media.token}
              serverUrl={media.url}
              connect
              audio={
                mediaPreferences.audioEnabled
                  ? {
                      ...(mediaPreferences.audioDeviceId
                        ? { deviceId: mediaPreferences.audioDeviceId }
                        : {}),
                      echoCancellation: true,
                      noiseSuppression: true,
                      autoGainControl: true,
                    }
                  : false
              }
              video={
                mediaPreferences.videoEnabled
                  ? {
                      ...(mediaPreferences.videoDeviceId
                        ? { deviceId: mediaPreferences.videoDeviceId }
                        : {}),
                    }
                  : false
              }
              data-lk-theme="default"
              onDisconnected={() =>
                setMedia((current) =>
                  current?.token === media.token ? null : current,
                )
              }
            >
              <VideoConference />
            </LiveKitRoom>
            </>
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
              <button
                className="button primary large"
                onClick={() => setPreflightOpen(true)}
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
          </div>
        </section>

        <SessionCollaborationPanel
          sessionId={sessionId}
          onJoinBreakout={(breakoutRoomId) => joinBreakout.mutate(breakoutRoomId)}
          onReturnToMain={() => returnToMain.mutate()}
        />
      </div>
    </div>
  );
}
