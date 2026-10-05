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
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [segmentText, setSegmentText] = useState('');
  const [segmentSpeaker, setSegmentSpeaker] = useState('');
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState('');
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
          speakerLabel: input.speakerLabel,
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
    mutationFn: (input: { version: number; summaryText: string }) =>
      api.updateMemorySummary(sessionId, input.version, {
        summaryText: input.summaryText,
      }),
    onSuccess: async () => {
      setEditingSummary(false);
      setSummaryDraft('');
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
            <h3>Action items</h3>
            <pre>{JSON.stringify(item.memorySummary?.actionItems ?? [], null, 2)}</pre>
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
