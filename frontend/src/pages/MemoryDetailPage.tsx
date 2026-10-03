import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';

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
  const memory = useQuery({
    queryKey: ['memory-detail', sessionId],
    queryFn: () => api.getMemory(sessionId),
    enabled: Boolean(sessionId),
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
    mutationFn: () =>
      api.updateTranscript(sessionId, {
        reason: transcriptReason.trim() || undefined,
        segments: transcriptDraft,
      }),
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
            <span className="eyebrow">Reviewed output</span>
            <h2>Summary</h2>
            {item.memorySummary?.summaryText ? (
              <p className="summary-copy">{item.memorySummary.summaryText}</p>
            ) : (
              <div className="artifact-placeholder">
                Summary generation is pending or was not requested. External actions remain
                blocked until a user reviews generated output.
              </div>
            )}
            <h3>Decisions</h3>
            <pre>{JSON.stringify(item.memorySummary?.decisions ?? [], null, 2)}</pre>
            <h3>Action items</h3>
            <pre>{JSON.stringify(item.memorySummary?.actionItems ?? [], null, 2)}</pre>
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
