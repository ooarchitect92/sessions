import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type MemoryActionItemRecord } from '../api/client';

interface TranscriptDraftSegment {
  position: number;
  startMs: number;
  endMs: number;
  speakerLabel: string | null;
  text: string;
}

function ArtifactState({
  label,
  status,
}: {
  label: string;
  status: string | undefined;
}) {
  return (
    <div className="artifact-state">
      <span>{label}</span>
      <strong>{status?.toLowerCase() ?? 'not requested'}</strong>
    </div>
  );
}

export function MemoryDetailPage() {
  const { sessionId = '' } = useParams();
  const queryClient = useQueryClient();
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [editingTranscript, setEditingTranscript] = useState(false);
  const [transcriptDraft, setTranscriptDraft] = useState<TranscriptDraftSegment[]>([]);
  const [transcriptReason, setTranscriptReason] = useState('');
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState('');
  const [decisionDrafts, setDecisionDrafts] = useState<string[]>([]);
  const [actionDrafts, setActionDrafts] = useState<MemoryActionItemRecord[]>([]);
  const [summaryReviewNote, setSummaryReviewNote] = useState('');
  const memory = useQuery({
    queryKey: ['memory-detail', sessionId],
    queryFn: () => api.getMemory(sessionId),
    enabled: Boolean(sessionId),
  });
  const summaryRevisions = useQuery({
    queryKey: ['memory-summary-revisions', sessionId],
    queryFn: () => api.listMemorySummaryRevisions(sessionId),
    enabled: Boolean(sessionId && memory.data?.memorySummary),
  });

  const revisions = useQuery({
    queryKey: ['transcript-revisions', sessionId],
    queryFn: () => api.listTranscriptRevisions(sessionId),
    enabled: Boolean(sessionId && memory.data?.transcript),
  });

  const retry = useMutation({
    mutationFn: () => api.retryMemory(sessionId),
    onSuccess: async () =>
      queryClient.invalidateQueries({ queryKey: ['memory-detail', sessionId] }),
  });
  const playback = useMutation({
    mutationFn: (disposition: 'inline' | 'attachment') =>
      api.createRecordingPlaybackGrant(sessionId, disposition),
    onSuccess: (grant) => {
      if (grant.disposition === 'attachment') {
        window.location.assign(grant.url);
      } else {
        setPlaybackUrl(grant.url);
      }
    },
  });
  const saveTranscript = useMutation({
    mutationFn: () => {
      const reason = transcriptReason.trim();
      return api.updateTranscript(sessionId, {
        ...(reason ? { reason } : {}),
        segments: transcriptDraft,
      });
    },
    onSuccess: async () => {
      setEditingTranscript(false);
      setTranscriptDraft([]);
      setTranscriptReason('');
      await queryClient.invalidateQueries({
        queryKey: ['memory-detail', sessionId],
      });
      await queryClient.invalidateQueries({
        queryKey: ['transcript-revisions', sessionId],
      });
      await queryClient.invalidateQueries({ queryKey: ['memory'] });
    },
  });

  const saveSummary = useMutation({
    mutationFn: () => {
      const reviewNote = summaryReviewNote.trim();
      return api.updateMemorySummary(sessionId, {
        summaryText: summaryDraft,
        decisions: decisionDrafts,
        actionItems: actionDrafts,
        ...(reviewNote ? { reviewNote } : {}),
      });
    },
    onSuccess: async () => {
      setEditingSummary(false);
      setSummaryDraft('');
      setDecisionDrafts([]);
      setActionDrafts([]);
      setSummaryReviewNote('');
      await queryClient.invalidateQueries({
        queryKey: ['memory-detail', sessionId],
      });
      await queryClient.invalidateQueries({
        queryKey: ['memory-summary-revisions', sessionId],
      });
      await queryClient.invalidateQueries({ queryKey: ['memory'] });
    },
  });

  const removeRecording = useMutation({
    mutationFn: () => api.deleteRecording(sessionId),
    onSuccess: async () => {
      setPlaybackUrl(null);
      await queryClient.invalidateQueries({
        queryKey: ['memory-detail', sessionId],
      });
      await queryClient.invalidateQueries({ queryKey: ['memory'] });
    },
  });

  if (memory.isLoading)
    return <div className="full-page-state">Loading session memory…</div>;
  if (memory.error || !memory.data) {
    return (
      <div className="full-page-state error-state">
        <h1>Memory unavailable</h1>
        <p>{memory.error?.message}</p>
        <Link className="button secondary" to="/memory">
          Back to memory
        </Link>
      </div>
    );
  }

  const item = memory.data;
  const hasFailure = [
    item.recording?.status,
    item.transcript?.status,
    item.memorySummary?.status,
  ].includes('FAILED');

  return (
    <div className="memory-detail-page">
      <header className="memory-detail-header">
        <Link className="back-link light-back" to="/memory">
          ←
        </Link>
        <div>
          <span className="eyebrow light">Meeting memory</span>
          <h1>{item.title}</h1>
          <p>
            {new Intl.DateTimeFormat(undefined, {
              dateStyle: 'full',
              timeStyle: 'short',
            }).format(new Date(item.startsAt))}
          </p>
        </div>
        {hasFailure ? (
          <button
            className="button ghost"
            onClick={() => retry.mutate()}
            disabled={retry.isPending}
          >
            {retry.isPending ? 'Retrying…' : 'Retry failed jobs'}
          </button>
        ) : null}
      </header>
      <main className="memory-detail-content">
        <section className="artifact-state-grid">
          <ArtifactState label="Recording" status={item.recording?.status} />
          <ArtifactState label="Transcript" status={item.transcript?.status} />
          <ArtifactState label="AI summary" status={item.memorySummary?.status} />
        </section>

        <section className="panel recording-playback-panel">
          <div className="recording-panel-heading">
            <div>
              <span className="eyebrow">Governed recording</span>
              <h2>Playback and retention</h2>
            </div>
            <strong>
              {item.recording?.retentionUntil
                ? `Retained until ${new Intl.DateTimeFormat(undefined, {
                    dateStyle: 'medium',
                  }).format(new Date(item.recording.retentionUntil))}`
                : 'No automatic expiry'}
            </strong>
          </div>
          {playbackUrl ? (
            <video className="recording-player" controls src={playbackUrl}>
              Your browser does not support video playback.
            </video>
          ) : item.recording?.status === 'READY' ? (
            <div className="recording-ready-actions">
              <button
                className="button primary"
                onClick={() => playback.mutate('inline')}
                disabled={playback.isPending}
              >
                {playback.isPending ? 'Authorizing…' : 'Play recording'}
              </button>
              <button
                className="button secondary"
                onClick={() => playback.mutate('attachment')}
                disabled={playback.isPending}
              >
                Download
              </button>
              <button
                className="button danger"
                onClick={() => {
                  if (
                    window.confirm(
                      'Permanently delete the stored recording? This cannot be undone.',
                    )
                  ) {
                    removeRecording.mutate();
                  }
                }}
                disabled={removeRecording.isPending}
              >
                {removeRecording.isPending ? 'Scheduling deletion…' : 'Delete'}
              </button>
            </div>
          ) : (
            <div className="artifact-placeholder">
              Playback becomes available after the egress worker finalizes the
              recording. Deleting and expired recordings never receive signed URLs.
            </div>
          )}
          {playback.error || removeRecording.error ? (
            <div className="error-banner compact-error">
              {(playback.error ?? removeRecording.error)?.message}
            </div>
          ) : null}
        </section>

        <div className="memory-detail-grid">
          <section className="panel memory-summary-panel">
            <div className="memory-summary-heading">
              <div>
                <span className="eyebrow">Reviewed output</span>
                <h2>Summary</h2>
              </div>
              {item.memorySummary?.status === 'READY' ? (
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => {
                    if (editingSummary) {
                      setEditingSummary(false);
                      setSummaryDraft('');
                      setDecisionDrafts([]);
                      setActionDrafts([]);
                      setSummaryReviewNote('');
                      return;
                    }
                    setSummaryDraft(item.memorySummary?.summaryText ?? '');
                    setDecisionDrafts([...(item.memorySummary?.decisions ?? [])]);
                    setActionDrafts(
                      (item.memorySummary?.actionItems ?? []).map((action) => ({
                        title: action.title,
                        owner: action.owner,
                        dueDate: action.dueDate,
                      })),
                    );
                    setSummaryReviewNote(item.memorySummary?.reviewNote ?? '');
                    setEditingSummary(true);
                  }}
                >
                  {editingSummary ? 'Cancel review' : 'Review & edit'}
                </button>
              ) : null}
            </div>

            {editingSummary ? (
              <div className="memory-summary-editor">
                <div className="summary-review-notice">
                  AI output stays internal until you review it. Saving creates an immutable
                  revision and records the reviewer in the audit trail.
                </div>

                <label>
                  Summary
                  <textarea
                    rows={8}
                    maxLength={50000}
                    value={summaryDraft}
                    onChange={(event) => setSummaryDraft(event.target.value)}
                  />
                </label>

                <div className="summary-edit-group">
                  <div className="summary-edit-group-heading">
                    <strong>Decisions</strong>
                    <button
                      className="button ghost compact-button"
                      type="button"
                      onClick={() => setDecisionDrafts((current) => [...current, ''])}
                    >
                      + Add
                    </button>
                  </div>
                  {decisionDrafts.map((decision, index) => (
                    <div className="summary-edit-row" key={index}>
                      <input
                        value={decision}
                        maxLength={2000}
                        placeholder="Decision"
                        onChange={(event) =>
                          setDecisionDrafts((current) =>
                            current.map((entry, entryIndex) =>
                              entryIndex === index ? event.target.value : entry,
                            ),
                          )
                        }
                      />
                      <button
                        className="icon-button"
                        type="button"
                        aria-label={`Remove decision ${index + 1}`}
                        onClick={() =>
                          setDecisionDrafts((current) =>
                            current.filter((_, entryIndex) => entryIndex !== index),
                          )
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>

                <div className="summary-edit-group">
                  <div className="summary-edit-group-heading">
                    <strong>Action items</strong>
                    <button
                      className="button ghost compact-button"
                      type="button"
                      onClick={() =>
                        setActionDrafts((current) => [
                          ...current,
                          { title: '', owner: null, dueDate: null },
                        ])
                      }
                    >
                      + Add
                    </button>
                  </div>
                  {actionDrafts.map((action, index) => (
                    <div className="action-edit-card" key={index}>
                      <input
                        value={action.title}
                        maxLength={500}
                        placeholder="Action item"
                        onChange={(event) =>
                          setActionDrafts((current) =>
                            current.map((entry, entryIndex) =>
                              entryIndex === index
                                ? { ...entry, title: event.target.value }
                                : entry,
                            ),
                          )
                        }
                      />
                      <input
                        value={action.owner ?? ''}
                        maxLength={160}
                        placeholder="Owner"
                        onChange={(event) =>
                          setActionDrafts((current) =>
                            current.map((entry, entryIndex) =>
                              entryIndex === index
                                ? { ...entry, owner: event.target.value || null }
                                : entry,
                            ),
                          )
                        }
                      />
                      <input
                        value={action.dueDate ?? ''}
                        maxLength={64}
                        placeholder="Due date"
                        onChange={(event) =>
                          setActionDrafts((current) =>
                            current.map((entry, entryIndex) =>
                              entryIndex === index
                                ? { ...entry, dueDate: event.target.value || null }
                                : entry,
                            ),
                          )
                        }
                      />
                      <button
                        className="button danger compact-button"
                        type="button"
                        onClick={() =>
                          setActionDrafts((current) =>
                            current.filter((_, entryIndex) => entryIndex !== index),
                          )
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>

                <label>
                  Review note
                  <input
                    value={summaryReviewNote}
                    maxLength={1000}
                    placeholder="Optional note about what you changed or verified"
                    onChange={(event) => setSummaryReviewNote(event.target.value)}
                  />
                </label>

                {saveSummary.error ? (
                  <div className="error-banner">{saveSummary.error.message}</div>
                ) : null}

                <button
                  className="button primary"
                  type="button"
                  disabled={
                    saveSummary.isPending ||
                    !summaryDraft.trim() ||
                    actionDrafts.some((action) => !action.title.trim())
                  }
                  onClick={() => saveSummary.mutate()}
                >
                  {saveSummary.isPending ? 'Saving review…' : 'Save reviewed summary'}
                </button>
              </div>
            ) : item.memorySummary?.summaryText ? (
              <>
                <p className="summary-copy">{item.memorySummary.summaryText}</p>
                <h3>Decisions</h3>
                {item.memorySummary.decisions?.length ? (
                  <ul className="summary-review-list">
                    {item.memorySummary.decisions.map((decision, index) => (
                      <li key={`${decision}-${index}`}>{decision}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="artifact-placeholder compact-placeholder">
                    No decisions were recorded.
                  </div>
                )}
                <h3>Action items</h3>
                {item.memorySummary.actionItems?.length ? (
                  <div className="summary-action-list">
                    {item.memorySummary.actionItems.map((action, index) => (
                      <article key={`${action.title}-${index}`}>
                        <strong>{action.title}</strong>
                        <span>
                          {action.owner ? `Owner: ${action.owner}` : 'Owner unassigned'}
                          {action.dueDate ? ` · Due: ${action.dueDate}` : ''}
                        </span>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="artifact-placeholder compact-placeholder">
                    No action items were recorded.
                  </div>
                )}
              </>
            ) : (
              <div className="artifact-placeholder">
                Summary generation is pending or was not requested. External actions remain
                blocked until a user reviews generated output.
              </div>
            )}

            {item.memorySummary ? (
              <div className="summary-review-status">
                <strong>Version {item.memorySummary.version}</strong>
                <span>
                  {item.memorySummary.reviewedAt
                    ? `Reviewed ${new Intl.DateTimeFormat(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(new Date(item.memorySummary.reviewedAt))}`
                    : 'AI-generated draft has not been reviewed yet'}
                </span>
                <span>
                  {summaryRevisions.data?.length
                    ? `${summaryRevisions.data.length} prior revision${summaryRevisions.data.length === 1 ? '' : 's'} retained`
                    : 'No prior summary revisions'}
                </span>
                {item.memorySummary.reviewNote ? (
                  <small>Review note: {item.memorySummary.reviewNote}</small>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="panel transcript-panel">
            <div className="transcript-panel-heading">
              <div>
                <span className="eyebrow">Speaker-aware timeline</span>
                <h2>Transcript</h2>
              </div>
              {item.transcript?.status === 'READY' && item.transcript.segments?.length ? (
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => {
                    if (editingTranscript) {
                      setEditingTranscript(false);
                      setTranscriptDraft([]);
                      setTranscriptReason('');
                      return;
                    }
                    setTranscriptDraft(
                      item.transcript!.segments!.map((segment) => ({
                        position: segment.position,
                        startMs: segment.startMs,
                        endMs: segment.endMs,
                        speakerLabel: segment.speakerLabel,
                        text: segment.text,
                      })),
                    );
                    setEditingTranscript(true);
                  }}
                >
                  {editingTranscript ? 'Cancel editing' : 'Correct transcript'}
                </button>
              ) : null}
            </div>

            {editingTranscript ? (
              <div className="transcript-editor">
                <div className="transcript-edit-notice">
                  Saving creates an immutable revision snapshot before replacing the current
                  transcript. AI summaries are not automatically rewritten.
                </div>
                {transcriptDraft.map((segment, index) => (
                  <div className="transcript-edit-row" key={segment.position}>
                    <div className="transcript-edit-meta">
                      <input
                        aria-label={`Speaker for segment ${index + 1}`}
                        value={segment.speakerLabel ?? ''}
                        maxLength={160}
                        placeholder="Speaker"
                        onChange={(event) =>
                          setTranscriptDraft((current) =>
                            current.map((entry, entryIndex) =>
                              entryIndex === index
                                ? { ...entry, speakerLabel: event.target.value || null }
                                : entry,
                            ),
                          )
                        }
                      />
                      <span>{Math.floor(segment.startMs / 1000)}s</span>
                    </div>
                    <textarea
                      aria-label={`Transcript text for segment ${index + 1}`}
                      rows={3}
                      maxLength={10000}
                      value={segment.text}
                      onChange={(event) =>
                        setTranscriptDraft((current) =>
                          current.map((entry, entryIndex) =>
                            entryIndex === index
                              ? { ...entry, text: event.target.value }
                              : entry,
                          ),
                        )
                      }
                    />
                  </div>
                ))}
                <label className="transcript-reason-field">
                  Correction note
                  <input
                    value={transcriptReason}
                    maxLength={1000}
                    placeholder="Optional reason for this correction"
                    onChange={(event) => setTranscriptReason(event.target.value)}
                  />
                </label>
                {saveTranscript.error ? (
                  <div className="error-banner">{saveTranscript.error.message}</div>
                ) : null}
                <button
                  className="button primary"
                  type="button"
                  disabled={
                    saveTranscript.isPending ||
                    transcriptDraft.some((segment) => !segment.text.trim())
                  }
                  onClick={() => saveTranscript.mutate()}
                >
                  {saveTranscript.isPending ? 'Saving revision…' : 'Save corrected transcript'}
                </button>
              </div>
            ) : item.transcript?.segments?.length ? (
              <div className="transcript-segments">
                {item.transcript.segments.map((segment) => (
                  <article key={segment.id}>
                    <span>
                      {segment.speakerLabel ?? 'Speaker'} ·{' '}
                      {Math.floor(segment.startMs / 1000)}s
                    </span>
                    <p>{segment.text}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="artifact-placeholder">
                Transcript segments will appear after the configured STT worker completes.
              </div>
            )}

            {item.transcript ? (
              <div className="transcript-revision-summary">
                <strong>Version {item.transcript.version}</strong>
                <span>
                  {revisions.data?.length
                    ? `${revisions.data.length} prior revision${revisions.data.length === 1 ? '' : 's'} retained`
                    : 'No prior corrections'}
                </span>
                {revisions.data?.[0]?.reason ? (
                  <small>Latest correction note: {revisions.data[0].reason}</small>
                ) : null}
              </div>
            ) : null}
          </section>
        </div>
      </main>
    </div>
  );
}
