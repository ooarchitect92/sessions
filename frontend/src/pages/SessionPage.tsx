import '@livekit/components-styles';
import { LiveKitRoom, VideoConference } from '@livekit/components-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type AgendaDraft, type MediaToken } from '../api/client';
import { AgendaContentStage } from '../components/AgendaContentStage';
import { SessionCollaborationPanel } from '../components/SessionCollaborationPanel';
import { WhiteboardPanel } from '../components/WhiteboardPanel';
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
  const [templatePanelOpen, setTemplatePanelOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [replaceAgendaWithTemplate, setReplaceAgendaWithTemplate] = useState(false);
  const [aiObjective, setAiObjective] = useState('');
  const [aiAudience, setAiAudience] = useState('');
  const [agendaDraft, setAgendaDraft] = useState<AgendaDraft | null>(null);
  const [agendaTitle, setAgendaTitle] = useState('');
  const [agendaDuration, setAgendaDuration] = useState(10);
  const [agendaUrl, setAgendaUrl] = useState('');
  const [agendaText, setAgendaText] = useState('');
  const [showSharedContent, setShowSharedContent] = useState(true);
  const [breakoutNotice, setBreakoutNotice] = useState<string | null>(null);
  const [handRaised, setHandRaised] = useState(false);
  const [raisedHands, setRaisedHands] = useState<Record<string, string>>({});
  const [reactionFeed, setReactionFeed] = useState<
    Array<{
      id: string;
      displayName: string;
      reaction: string;
    }>
  >([]);
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

  useEffect(() => {
    const breakoutHandler = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      if (!detail?.message) return;
      setBreakoutNotice(detail.message);
      window.setTimeout(() => setBreakoutNotice(null), 8000);
    };
    const reactionHandler = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          userId?: string;
          displayName?: string;
          reaction?: string;
          occurredAt?: string;
        }>
      ).detail;
      if (!detail?.reaction || !detail.displayName) return;
      const id = `${detail.userId ?? 'user'}-${detail.occurredAt ?? Date.now()}`;
      setReactionFeed((current) =>
        [...current, { id, displayName: detail.displayName!, reaction: detail.reaction! }].slice(-6),
      );
      window.setTimeout(() => {
        setReactionFeed((current) => current.filter((item) => item.id !== id));
      }, 4500);
    };
    const handRaiseHandler = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          userId?: string;
          displayName?: string;
          raised?: boolean;
        }>
      ).detail;
      if (!detail?.userId || !detail.displayName) return;
      setRaisedHands((current) => {
        const next = { ...current };
        if (detail.raised) next[detail.userId!] = detail.displayName!;
        else delete next[detail.userId!];
        return next;
      });
    };

    window.addEventListener('sessions:breakout-broadcast', breakoutHandler);
    window.addEventListener('sessions:reaction', reactionHandler);
    window.addEventListener('sessions:hand-raise', handRaiseHandler);
    return () => {
      window.removeEventListener('sessions:breakout-broadcast', breakoutHandler);
      window.removeEventListener('sessions:reaction', reactionHandler);
      window.removeEventListener('sessions:hand-raise', handRaiseHandler);
    };
  }, []);

  const session = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => api.getSession(sessionId),
    enabled: Boolean(sessionId),
  });

  const agendaTemplates = useQuery({
    queryKey: ['agenda-templates'],
    queryFn: () => api.listAgendaTemplates(),
    enabled: templatePanelOpen,
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

  const joinBreakout = useMutation({
    mutationFn: (breakoutRoomId: string) =>
      api.createBreakoutMediaToken(sessionId, breakoutRoomId),
    onSuccess: (token) => {
      setShowSharedContent(false);
      setMedia(token);
    },
  });

  const sendReaction = useMutation({
    mutationFn: (reaction: '👍' | '👏' | '❤️' | '😂' | '🎉') =>
      api.sendReaction(sessionId, reaction),
  });

  const toggleHandRaise = useMutation({
    mutationFn: (raised: boolean) => api.setHandRaise(sessionId, raised),
    onSuccess: (result) => setHandRaised(result.raised),
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

  const saveAgendaTemplate = useMutation({
    mutationFn: () =>
      api.saveSessionAgendaAsTemplate(sessionId, { name: templateName }),
    onSuccess: async (template) => {
      setTemplateName('');
      setSelectedTemplateId(template.id);
      await queryClient.invalidateQueries({ queryKey: ['agenda-templates'] });
    },
  });

  const applyAgendaTemplate = useMutation({
    mutationFn: () => {
      if (!selectedTemplateId) throw new Error('Choose an agenda template first');
      return api.applyAgendaTemplate(
        sessionId,
        selectedTemplateId,
        replaceAgendaWithTemplate,
      );
    },
    onSuccess: async () => {
      setTemplatePanelOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
    },
  });

  const deleteAgendaTemplate = useMutation({
    mutationFn: (templateId: string) => api.deleteAgendaTemplate(templateId),
    onSuccess: async (_, templateId) => {
      if (selectedTemplateId === templateId) setSelectedTemplateId('');
      await queryClient.invalidateQueries({ queryKey: ['agenda-templates'] });
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
      ['WEBSITE', 'PRESENTATION', 'VIDEO', 'WHITEBOARD'].includes(activeAgendaItem.type));

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
          <div className="session-reaction-controls" aria-label="Meeting reactions">
            {(['👍', '👏', '❤️', '😂', '🎉'] as const).map((reaction) => (
              <button
                key={reaction}
                type="button"
                className="reaction-button"
                disabled={sendReaction.isPending}
                onClick={() => sendReaction.mutate(reaction)}
                aria-label={`Send ${reaction} reaction`}
              >
                {reaction}
              </button>
            ))}
            <button
              type="button"
              className={handRaised ? 'hand-raise-button active' : 'hand-raise-button'}
              disabled={toggleHandRaise.isPending}
              onClick={() => toggleHandRaise.mutate(!handRaised)}
            >
              ✋ {handRaised ? 'Lower hand' : 'Raise hand'}
            </button>
          </div>
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
                  className="agenda-template-button"
                  type="button"
                  onClick={() => setTemplatePanelOpen((value) => !value)}
                  aria-expanded={templatePanelOpen}
                >
                  Templates
                </button>
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
          {templatePanelOpen ? (
            <section className="agenda-template-panel">
              <span className="eyebrow">Reusable agenda library</span>
              <h3>Agenda templates</h3>
              <p>
                Save this run of show for reuse, or apply a workspace template to this session.
              </p>
              <label>
                Save current agenda
                <div className="agenda-template-save-row">
                  <input
                    maxLength={160}
                    value={templateName}
                    onChange={(event) => setTemplateName(event.target.value)}
                    placeholder="Sales discovery"
                  />
                  <button
                    className="button secondary"
                    type="button"
                    disabled={
                      saveAgendaTemplate.isPending ||
                      !templateName.trim() ||
                      current.agendaItems.length === 0
                    }
                    onClick={() => saveAgendaTemplate.mutate()}
                  >
                    {saveAgendaTemplate.isPending ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </label>
              {saveAgendaTemplate.error ? (
                <div className="error-banner">{saveAgendaTemplate.error.message}</div>
              ) : null}
              <label>
                Apply template
                <select
                  value={selectedTemplateId}
                  onChange={(event) => setSelectedTemplateId(event.target.value)}
                >
                  <option value="">Choose a template</option>
                  {agendaTemplates.data?.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} · {template.items.length} items
                    </option>
                  ))}
                </select>
              </label>
              <label className="agenda-template-checkbox">
                <input
                  type="checkbox"
                  checked={replaceAgendaWithTemplate}
                  onChange={(event) =>
                    setReplaceAgendaWithTemplate(event.target.checked)
                  }
                />
                Replace existing agenda instead of appending
              </label>
              {selectedTemplateId ? (
                <div className="agenda-template-preview">
                  {agendaTemplates.data
                    ?.find((template) => template.id === selectedTemplateId)
                    ?.items.map((item) => (
                      <div key={item.id}>
                        <strong>{item.title}</strong>
                        <span>
                          {Math.round(item.durationSeconds / 60)} min ·{' '}
                          {item.type.toLowerCase().replace('_', ' ')}
                        </span>
                      </div>
                    ))}
                </div>
              ) : null}
              <div className="agenda-template-actions">
                <button
                  className="button primary"
                  type="button"
                  disabled={applyAgendaTemplate.isPending || !selectedTemplateId}
                  onClick={() => applyAgendaTemplate.mutate()}
                >
                  {applyAgendaTemplate.isPending ? 'Applying…' : 'Apply template'}
                </button>
                {selectedTemplateId ? (
                  <button
                    className="button secondary"
                    type="button"
                    disabled={deleteAgendaTemplate.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          'Delete this agenda template from the workspace library?',
                        )
                      ) {
                        deleteAgendaTemplate.mutate(selectedTemplateId);
                      }
                    }}
                  >
                    Delete
                  </button>
                ) : null}
              </div>
              {applyAgendaTemplate.error ? (
                <div className="error-banner">{applyAgendaTemplate.error.message}</div>
              ) : null}
            </section>
          ) : null}
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
          {activeAgendaItem?.type === 'WHITEBOARD' && showSharedContent ? (
            <div className="meeting-whiteboard-stage">
              <div className="agenda-content-toolbar">
                <div>
                  <span className="eyebrow">Shared agenda content</span>
                  <strong>{activeAgendaItem.title}</strong>
                  <small>collaborative whiteboard</small>
                </div>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => setShowSharedContent(false)}
                >
                  Show media
                </button>
              </div>
              <WhiteboardPanel sessionId={sessionId} />
            </div>
          ) : activeHasSharedContent && showSharedContent && activeAgendaItem ? (
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
          {reactionFeed.length ? (
            <div className="reaction-feed" aria-live="polite">
              {reactionFeed.map((item) => (
                <div key={item.id}>
                  <span>{item.reaction}</span>
                  <small>{item.displayName}</small>
                </div>
              ))}
            </div>
          ) : null}
          {Object.keys(raisedHands).length ? (
            <div className="raised-hands-badge">
              <span>✋</span>
              <strong>{Object.values(raisedHands).join(', ')}</strong>
            </div>
          ) : null}
        </section>

        <SessionCollaborationPanel
          sessionId={sessionId}
          onJoinBreakout={(breakoutRoomId) => joinBreakout.mutate(breakoutRoomId)}
        />
      </div>
      {breakoutNotice ? (
        <div className="breakout-toast">
          <strong>Host announcement</strong>
          <span>{breakoutNotice}</span>
        </div>
      ) : null}
      {joinBreakout.error ? (
        <div className="breakout-toast error-banner">
          {joinBreakout.error.message}
        </div>
      ) : null}
    </div>
  );
}
