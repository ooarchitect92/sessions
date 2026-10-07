import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';

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
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [decisions, setDecisions] = useState<Array<{ text: string }>>([]);
  const [actionItems, setActionItems] = useState<
    Array<{ text: string; owner?: string | null; dueDate?: string | null }>
  >([]);
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
  const updateSummary = useMutation({
    mutationFn: () => {
      const summary = memory.data?.memorySummary;
      if (!summary) throw new Error('Summary is unavailable');
      return api.updateMemorySummary(sessionId, summary.version, {
        summaryText: summaryText.trim(),
        decisions: decisions.filter((item) => item.text.trim()).map((item) => ({
          text: item.text.trim(),
        })),
        actionItems: actionItems
          .filter((item) => item.text.trim())
          .map((item) => ({
            text: item.text.trim(),
            ...(item.owner?.trim() ? { owner: item.owner.trim() } : {}),
            ...(item.dueDate ? { dueDate: item.dueDate } : {}),
          })),
      });
    },
    onSuccess: async () => {
      setEditingSummary(false);
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
  const beginSummaryReview = () => {
    const summary = item.memorySummary;
    if (!summary) return;
    setSummaryText(summary.summaryText ?? '');
    setDecisions(summary.decisions.map((decision) => ({ text: decision.text })));
    setActionItems(
      summary.actionItems.map((action) => ({
        text: action.text,
        owner: action.owner ?? '',
        dueDate: action.dueDate ?? '',
      })),
    );
    setEditingSummary(true);
  };

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
            <div className="summary-review-heading">
              <div>
                <span className="eyebrow">Reviewed output</span>
                <h2>Summary</h2>
              </div>
              {item.memorySummary?.status === 'READY' && !editingSummary ? (
                <button
                  type="button"
                  className="button secondary"
                  onClick={beginSummaryReview}
                >
                  Review & edit
                </button>
              ) : null}
            </div>

            {editingSummary ? (
              <div className="summary-review-editor">
                <label>
                  Summary
                  <textarea
                    value={summaryText}
                    maxLength={20000}
                    onChange={(event) => setSummaryText(event.target.value)}
                  />
                </label>

                <div className="review-list-heading">
                  <h3>Decisions</h3>
                  <button
                    type="button"
                    onClick={() => setDecisions((items) => [...items, { text: '' }])}
                  >
                    + Add decision
                  </button>
                </div>
                <div className="review-edit-list">
                  {decisions.map((decision, index) => (
                    <div className="review-edit-row" key={index}>
                      <input
                        value={decision.text}
                        maxLength={2000}
                        placeholder="Decision"
                        onChange={(event) =>
                          setDecisions((items) =>
                            items.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, text: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                      <button
                        type="button"
                        aria-label="Remove decision"
                        onClick={() =>
                          setDecisions((items) =>
                            items.filter((_, itemIndex) => itemIndex !== index),
                          )
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>

                <div className="review-list-heading">
                  <h3>Action items</h3>
                  <button
                    type="button"
                    onClick={() =>
                      setActionItems((items) => [
                        ...items,
                        { text: '', owner: '', dueDate: '' },
                      ])
                    }
                  >
                    + Add action
                  </button>
                </div>
                <div className="review-edit-list">
                  {actionItems.map((action, index) => (
                    <div className="review-action-card" key={index}>
                      <div className="review-edit-row">
                        <input
                          value={action.text}
                          maxLength={2000}
                          placeholder="Action item"
                          onChange={(event) =>
                            setActionItems((items) =>
                              items.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, text: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                        <button
                          type="button"
                          aria-label="Remove action item"
                          onClick={() =>
                            setActionItems((items) =>
                              items.filter((_, itemIndex) => itemIndex !== index),
                            )
                          }
                        >
                          ×
                        </button>
                      </div>
                      <div className="review-action-meta">
                        <input
                          value={action.owner ?? ''}
                          maxLength={160}
                          placeholder="Owner (optional)"
                          onChange={(event) =>
                            setActionItems((items) =>
                              items.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, owner: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                        <input
                          type="datetime-local"
                          value={action.dueDate?.slice(0, 16) ?? ''}
                          onChange={(event) =>
                            setActionItems((items) =>
                              items.map((item, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      ...item,
                                      dueDate: event.target.value
                                        ? new Date(event.target.value).toISOString()
                                        : '',
                                    }
                                  : item,
                              ),
                            )
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {updateSummary.error ? (
                  <div className="error-banner">{updateSummary.error.message}</div>
                ) : null}
                <div className="summary-review-actions">
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setEditingSummary(false)}
                    disabled={updateSummary.isPending}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => updateSummary.mutate()}
                    disabled={updateSummary.isPending || !summaryText.trim()}
                  >
                    {updateSummary.isPending ? 'Saving review…' : 'Save reviewed output'}
                  </button>
                </div>
              </div>
            ) : item.memorySummary?.summaryText ? (
              <>
                <p className="summary-copy">{item.memorySummary.summaryText}</p>
                <h3>Decisions</h3>
                {item.memorySummary.decisions.length ? (
                  <ul className="reviewed-output-list">
                    {item.memorySummary.decisions.map((decision, index) => (
                      <li key={index}>{decision.text}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="summary-empty-copy">No decisions recorded.</p>
                )}
                <h3>Action items</h3>
                {item.memorySummary.actionItems.length ? (
                  <ul className="reviewed-output-list">
                    {item.memorySummary.actionItems.map((action, index) => (
                      <li key={index}>
                        <strong>{action.text}</strong>
                        {action.owner ? <span>Owner: {action.owner}</span> : null}
                        {action.dueDate ? (
                          <span>
                            Due:{' '}
                            {new Intl.DateTimeFormat(undefined, {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            }).format(new Date(action.dueDate))}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="summary-empty-copy">No action items recorded.</p>
                )}
              </>
            ) : (
              <div className="artifact-placeholder">
                Summary generation is pending or was not requested. External actions remain
                blocked until a user reviews generated output.
              </div>
            )}
          </section>

          <section className="panel transcript-panel">
            <span className="eyebrow">Speaker-aware timeline</span>
            <h2>Transcript</h2>
            {item.transcript?.segments?.length ? (
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
          </section>
        </div>
      </main>
    </div>
  );
}
