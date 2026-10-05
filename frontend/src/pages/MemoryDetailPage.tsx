import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type AiActionItemRecord } from '../api/client';

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
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [segmentText, setSegmentText] = useState('');
  const [segmentSpeaker, setSegmentSpeaker] = useState('');
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState('');
  const [editingActions, setEditingActions] = useState(false);
  const [actionDrafts, setActionDrafts] = useState<AiActionItemRecord[]>([]);
  const [editingFollowUp, setEditingFollowUp] = useState(false);
  const [followUpSubject, setFollowUpSubject] = useState('');
  const [followUpBody, setFollowUpBody] = useState('');
  const [followUpRecipients, setFollowUpRecipients] = useState('');
  const memory = useQuery({
    queryKey: ['memory-detail', sessionId],
    queryFn: () => api.getMemory(sessionId),
    enabled: Boolean(sessionId),
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
  const updateTranscriptSegment = useMutation({
    mutationFn: (input: {
      segmentId: string;
      version: number;
      text: string;
      speakerLabel?: string | null;
    }) =>
      api.updateTranscriptSegment(
        sessionId,
        input.segmentId,
        input.version,
        {
          text: input.text,
          ...(input.speakerLabel !== undefined
            ? { speakerLabel: input.speakerLabel }
            : {}),
        },
      ),
    onSuccess: async () => {
      setEditingSegmentId(null);
      setSegmentText('');
      setSegmentSpeaker('');
      await queryClient.invalidateQueries({
        queryKey: ['memory-detail', sessionId],
      });
      await queryClient.invalidateQueries({ queryKey: ['memory'] });
    },
  });

  const updateSummary = useMutation({
    mutationFn: (input: {
      version: number;
      summaryText: string;
      actionItems?: AiActionItemRecord[];
    }) =>
      api.updateMemorySummary(sessionId, input.version, {
        summaryText: input.summaryText,
        ...(input.actionItems ? { actionItems: input.actionItems } : {}),
      }),
    onSuccess: async () => {
      setEditingSummary(false);
      setSummaryDraft('');
      setEditingActions(false);
      setActionDrafts([]);
      await queryClient.invalidateQueries({
        queryKey: ['memory-detail', sessionId],
      });
      await queryClient.invalidateQueries({ queryKey: ['memory'] });
    },
  });

  const approveSummary = useMutation({
    mutationFn: (version: number) =>
      api.approveMemorySummary(sessionId, version),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['memory-detail', sessionId],
      });
      await queryClient.invalidateQueries({ queryKey: ['memory'] });
    },
  });

  const generateFollowUp = useMutation({
    mutationFn: () => api.generateFollowUpDraft(sessionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['memory-detail', sessionId],
      });
      await queryClient.invalidateQueries({ queryKey: ['memory'] });
    },
  });

  const updateFollowUp = useMutation({
    mutationFn: (input: {
      version: number;
      subject: string;
      body: string;
    }) =>
      api.updateFollowUpDraft(sessionId, input.version, {
        subject: input.subject,
        body: input.body,
      }),
    onSuccess: async () => {
      setEditingFollowUp(false);
      await queryClient.invalidateQueries({
        queryKey: ['memory-detail', sessionId],
      });
      await queryClient.invalidateQueries({ queryKey: ['memory'] });
    },
  });

  const approveFollowUp = useMutation({
    mutationFn: (version: number) =>
      api.approveFollowUpDraft(sessionId, version),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['memory-detail', sessionId],
      });
      await queryClient.invalidateQueries({ queryKey: ['memory'] });
    },
  });

  const sendFollowUp = useMutation({
    mutationFn: () => {
      const recipients = followUpRecipients
        .split(/[\n,;]/)
        .map((value) => value.trim())
        .filter(Boolean);
      if (!recipients.length) {
        throw new Error('Add at least one recipient email address');
      }
      return api.sendFollowUpDraft(sessionId, recipients);
    },
    onSuccess: async () => {
      setFollowUpRecipients('');
      await queryClient.invalidateQueries({
        queryKey: ['memory-detail', sessionId],
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
                <span
                  className={
                    item.memorySummary.reviewedAt
                      ? 'state-chip enabled'
                      : 'state-chip'
                  }
                >
                  {item.memorySummary.reviewedAt ? 'Approved' : 'Needs review'}
                </span>
              ) : null}
            </div>

            {editingSummary && item.memorySummary ? (
              <div className="summary-review-form">
                <label>
                  Summary text
                  <textarea
                    rows={10}
                    maxLength={20000}
                    value={summaryDraft}
                    onChange={(event) => setSummaryDraft(event.target.value)}
                  />
                </label>
                <div className="summary-review-actions">
                  <button
                    className="button primary"
                    disabled={
                      updateSummary.isPending || !summaryDraft.trim()
                    }
                    onClick={() =>
                      updateSummary.mutate({
                        version: item.memorySummary?.version ?? 1,
                        summaryText: summaryDraft.trim(),
                      })
                    }
                  >
                    {updateSummary.isPending ? 'Saving…' : 'Save reviewed summary'}
                  </button>
                  <button
                    className="button secondary"
                    disabled={updateSummary.isPending}
                    onClick={() => {
                      setEditingSummary(false);
                      setSummaryDraft('');
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : item.memorySummary?.summaryText ? (
              <p className="summary-copy">{item.memorySummary.summaryText}</p>
            ) : (
              <div className="artifact-placeholder">
                Summary generation is pending or was not requested. External actions remain
                blocked until a user reviews generated output.
              </div>
            )}

            {item.memorySummary?.status === 'READY' && !editingSummary ? (
              <div className="summary-review-actions">
                <button
                  className="button secondary"
                  onClick={() => {
                    setSummaryDraft(item.memorySummary?.summaryText ?? '');
                    setEditingSummary(true);
                  }}
                >
                  Edit summary
                </button>
                <button
                  className="button primary"
                  disabled={
                    approveSummary.isPending ||
                    Boolean(item.memorySummary.reviewedAt)
                  }
                  onClick={() =>
                    approveSummary.mutate(item.memorySummary?.version ?? 1)
                  }
                >
                  {approveSummary.isPending
                    ? 'Approving…'
                    : item.memorySummary.reviewedAt
                      ? 'Approved'
                      : 'Approve summary'}
                </button>
              </div>
            ) : null}

            {updateSummary.error || approveSummary.error ? (
              <div className="error-banner compact-error">
                {(updateSummary.error ?? approveSummary.error)?.message}
              </div>
            ) : null}

            <h3>Decisions</h3>
            <pre>{JSON.stringify(item.memorySummary?.decisions ?? [], null, 2)}</pre>
            <div className="summary-section-heading">
              <h3>Action items</h3>
              {item.memorySummary?.status === 'READY' ? (
                <button
                  className="button ghost compact-button"
                  onClick={() => {
                    setActionDrafts(
                      (item.memorySummary?.actionItems ?? []).map((action) => ({
                        ...action,
                        ...(action.citations
                          ? { citations: [...action.citations] }
                          : {}),
                      })),
                    );
                    setEditingActions(true);
                  }}
                >
                  Edit actions
                </button>
              ) : null}
            </div>

            {editingActions && item.memorySummary ? (
              <div className="action-review-list">
                {actionDrafts.length ? (
                  actionDrafts.map((action, index) => (
                    <article className="action-review-card" key={`${index}-${action.text}`}>
                      <label>
                        Action
                        <textarea
                          rows={3}
                          maxLength={4000}
                          value={action.text}
                          onChange={(event) => {
                            const next = [...actionDrafts];
                            next[index] = { ...action, text: event.target.value };
                            setActionDrafts(next);
                          }}
                        />
                      </label>
                      <div className="action-review-grid">
                        <label>
                          Owner
                          <input
                            maxLength={320}
                            value={action.owner ?? ''}
                            onChange={(event) => {
                              const next = [...actionDrafts];
                              next[index] = event.target.value
                                ? { ...action, owner: event.target.value }
                                : (({ owner: _owner, ...rest }) => rest)(action);
                              setActionDrafts(next);
                            }}
                          />
                        </label>
                        <label>
                          Due date / note
                          <input
                            maxLength={100}
                            value={action.dueDate ?? ''}
                            onChange={(event) => {
                              const next = [...actionDrafts];
                              next[index] = event.target.value
                                ? { ...action, dueDate: event.target.value }
                                : (({ dueDate: _dueDate, ...rest }) => rest)(action);
                              setActionDrafts(next);
                            }}
                          />
                        </label>
                      </div>
                      <button
                        className="button danger compact-button"
                        type="button"
                        onClick={() =>
                          setActionDrafts((current) =>
                            current.filter((_, itemIndex) => itemIndex !== index),
                          )
                        }
                      >
                        Remove
                      </button>
                    </article>
                  ))
                ) : (
                  <div className="artifact-placeholder">No action items yet.</div>
                )}
                <button
                  className="button secondary"
                  type="button"
                  onClick={() =>
                    setActionDrafts((current) => [
                      ...current,
                      { text: '', citations: [] },
                    ])
                  }
                >
                  Add action item
                </button>
                <div className="summary-review-actions">
                  <button
                    className="button primary"
                    disabled={
                      updateSummary.isPending ||
                      actionDrafts.some((action) => !action.text.trim())
                    }
                    onClick={() =>
                      updateSummary.mutate({
                        version: item.memorySummary?.version ?? 1,
                        summaryText: item.memorySummary?.summaryText ?? '',
                        actionItems: actionDrafts.map((action) => ({
                          text: action.text.trim(),
                          ...(action.owner?.trim()
                            ? { owner: action.owner.trim() }
                            : {}),
                          ...(action.dueDate?.trim()
                            ? { dueDate: action.dueDate.trim() }
                            : {}),
                          ...(action.citations
                            ? { citations: action.citations }
                            : {}),
                        })),
                      })
                    }
                  >
                    {updateSummary.isPending ? 'Saving…' : 'Save action items'}
                  </button>
                  <button
                    className="button secondary"
                    disabled={updateSummary.isPending}
                    onClick={() => {
                      setEditingActions(false);
                      setActionDrafts([]);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : item.memorySummary?.actionItems?.length ? (
              <div className="reviewed-action-list">
                {item.memorySummary.actionItems.map((action, index) => (
                  <article key={`${index}-${action.text}`}>
                    <strong>{action.text}</strong>
                    <span>
                      {action.owner ? `Owner: ${action.owner}` : 'Owner unassigned'}
                      {action.dueDate ? ` · Due: ${action.dueDate}` : ''}
                    </span>
                  </article>
                ))}
              </div>
            ) : (
              <div className="artifact-placeholder">No action items extracted.</div>
            )}

            <div className="follow-up-section">
              <div className="summary-section-heading">
                <div>
                  <span className="eyebrow">AI follow-up</span>
                  <h3>Email draft</h3>
                </div>
                {item.memorySummary?.followUpApprovedAt ? (
                  <span className="state-chip enabled">Approved</span>
                ) : item.memorySummary?.followUpGeneratedAt ? (
                  <span className="state-chip">Needs review</span>
                ) : null}
              </div>

              {!item.memorySummary?.followUpGeneratedAt ? (
                <div className="follow-up-empty">
                  <p>
                    Generate a follow-up only after the meeting summary has been
                    approved. Nothing is sent automatically.
                  </p>
                  <button
                    className="button secondary"
                    disabled={
                      generateFollowUp.isPending ||
                      !Boolean(item.memorySummary?.reviewedAt)
                    }
                    onClick={() => generateFollowUp.mutate()}
                  >
                    {generateFollowUp.isPending
                      ? 'Drafting…'
                      : 'Generate follow-up draft'}
                  </button>
                </div>
              ) : editingFollowUp ? (
                <div className="follow-up-editor">
                  <label>
                    Subject
                    <input
                      maxLength={300}
                      value={followUpSubject}
                      onChange={(event) => setFollowUpSubject(event.target.value)}
                    />
                  </label>
                  <label>
                    Body
                    <textarea
                      rows={12}
                      maxLength={20000}
                      value={followUpBody}
                      onChange={(event) => setFollowUpBody(event.target.value)}
                    />
                  </label>
                  <div className="summary-review-actions">
                    <button
                      className="button primary"
                      disabled={
                        updateFollowUp.isPending ||
                        !followUpSubject.trim() ||
                        !followUpBody.trim()
                      }
                      onClick={() =>
                        updateFollowUp.mutate({
                          version: item.memorySummary?.version ?? 1,
                          subject: followUpSubject.trim(),
                          body: followUpBody.trim(),
                        })
                      }
                    >
                      {updateFollowUp.isPending ? 'Saving…' : 'Save draft'}
                    </button>
                    <button
                      className="button secondary"
                      disabled={updateFollowUp.isPending}
                      onClick={() => setEditingFollowUp(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="follow-up-preview">
                  <strong>
                    {item.memorySummary.followUpDraft.subject ??
                      'Follow-up subject'}
                  </strong>
                  <p>{item.memorySummary.followUpDraft.body ?? ''}</p>
                  <div className="summary-review-actions">
                    <button
                      className="button secondary"
                      onClick={() => {
                        setFollowUpSubject(
                          item.memorySummary?.followUpDraft.subject ?? '',
                        );
                        setFollowUpBody(
                          item.memorySummary?.followUpDraft.body ?? '',
                        );
                        setEditingFollowUp(true);
                      }}
                    >
                      Edit follow-up
                    </button>
                    <button
                      className="button primary"
                      disabled={
                        approveFollowUp.isPending ||
                        Boolean(item.memorySummary.followUpApprovedAt)
                      }
                      onClick={() =>
                        approveFollowUp.mutate(
                          item.memorySummary?.version ?? 1,
                        )
                      }
                    >
                      {approveFollowUp.isPending
                        ? 'Approving…'
                        : item.memorySummary.followUpApprovedAt
                          ? 'Approved'
                          : 'Approve follow-up'}
                    </button>
                  </div>

                  {item.memorySummary.followUpApprovedAt ? (
                    <div className="follow-up-send-panel">
                      <label>
                        Recipients
                        <textarea
                          rows={3}
                          value={followUpRecipients}
                          onChange={(event) =>
                            setFollowUpRecipients(event.target.value)
                          }
                          placeholder="alice@example.com, bob@example.com"
                        />
                      </label>
                      <button
                        className="button primary"
                        disabled={sendFollowUp.isPending}
                        onClick={() => sendFollowUp.mutate()}
                      >
                        {sendFollowUp.isPending
                          ? 'Queueing delivery…'
                          : 'Send approved follow-up'}
                      </button>
                      <small>
                        Delivery is queued to the configured email provider and
                        never occurs before approval.
                      </small>
                    </div>
                  ) : null}

                  {item.emailDeliveries?.length ? (
                    <div className="email-delivery-list">
                      <strong>Delivery history</strong>
                      {item.emailDeliveries.map((delivery) => (
                        <article key={delivery.id}>
                          <span>
                            {delivery.status.toLowerCase()} ·{' '}
                            {delivery.recipients.join(', ')}
                          </span>
                          <small>
                            {delivery.sentAt
                              ? new Intl.DateTimeFormat(undefined, {
                                  dateStyle: 'medium',
                                  timeStyle: 'short',
                                }).format(new Date(delivery.sentAt))
                              : delivery.failureCode ?? 'Awaiting worker'}
                          </small>
                        </article>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}

              {generateFollowUp.error ||
              updateFollowUp.error ||
              approveFollowUp.error ||
              sendFollowUp.error ? (
                <div className="error-banner compact-error">
                  {(
                    generateFollowUp.error ??
                    updateFollowUp.error ??
                    approveFollowUp.error ??
                    sendFollowUp.error
                  )?.message}
                </div>
              ) : null}
            </div>
          </section>

          <section className="panel transcript-panel">
            <span className="eyebrow">Speaker-aware timeline</span>
            <h2>Transcript</h2>
            {item.transcript?.segments?.length ? (
              <div className="transcript-segments">
                {item.transcript.segments.map((segment) => {
                  const editing = editingSegmentId === segment.id;
                  return (
                    <article key={segment.id}>
                      {editing ? (
                        <div className="transcript-edit-form">
                          <label>
                            Speaker
                            <input
                              value={segmentSpeaker}
                              maxLength={160}
                              onChange={(event) =>
                                setSegmentSpeaker(event.target.value)
                              }
                            />
                          </label>
                          <label>
                            Transcript text
                            <textarea
                              value={segmentText}
                              maxLength={5000}
                              rows={4}
                              onChange={(event) =>
                                setSegmentText(event.target.value)
                              }
                            />
                          </label>
                          <div className="transcript-edit-actions">
                            <button
                              className="button primary"
                              disabled={
                                updateTranscriptSegment.isPending ||
                                !segmentText.trim()
                              }
                              onClick={() =>
                                updateTranscriptSegment.mutate({
                                  segmentId: segment.id,
                                  version: item.transcript?.version ?? 1,
                                  text: segmentText.trim(),
                                  speakerLabel:
                                    segmentSpeaker.trim() || null,
                                })
                              }
                            >
                              {updateTranscriptSegment.isPending
                                ? 'Saving…'
                                : 'Save correction'}
                            </button>
                            <button
                              className="button secondary"
                              disabled={updateTranscriptSegment.isPending}
                              onClick={() => {
                                setEditingSegmentId(null);
                                setSegmentText('');
                                setSegmentSpeaker('');
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <span>
                            {segment.speakerLabel ?? 'Speaker'} ·{' '}
                            {Math.floor(segment.startMs / 1000)}s
                          </span>
                          <p>{segment.text}</p>
                          <button
                            className="button ghost compact-button"
                            onClick={() => {
                              setEditingSegmentId(segment.id);
                              setSegmentText(segment.text);
                              setSegmentSpeaker(segment.speakerLabel ?? '');
                            }}
                          >
                            Correct
                          </button>
                        </>
                      )}
                    </article>
                  );
                })}
                {updateTranscriptSegment.error ? (
                  <div className="error-banner compact-error">
                    {updateTranscriptSegment.error.message}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="artifact-placeholder">
                Transcript segments will appear after the configured STT worker completes.
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
