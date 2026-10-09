import { useEffect, useRef, useState } from 'react';
import {
  publishCaptionAudio,
  type LiveCaptionErrorPayload,
  type LiveCaptionRealtimePayload,
} from '../hooks/use-session-realtime';

const CHUNK_DURATION_MS = 4000;
const CHUNK_GAP_MS = 180;

function preferredMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const candidate of [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
  ]) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return '';
}

export function LiveCaptionsPanel({
  sessionId,
  canPublish,
}: {
  sessionId: string;
  canPublish: boolean;
}) {
  const [captions, setCaptions] = useState<LiveCaptionRealtimePayload[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [language, setLanguage] = useState(
    () => navigator.language?.trim() || 'en',
  );
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const sequenceRef = useRef(0);

  const stopPublishing = () => {
    runningRef.current = false;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        // The recorder may already be stopping after a device interruption.
      }
    }
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
    setPublishing(false);
  };

  useEffect(() => {
    const captionEvent = `sessions:caption-final:${sessionId}`;
    const errorEvent = `sessions:caption-error:${sessionId}`;

    const onCaption = (event: Event) => {
      const detail = (event as CustomEvent<LiveCaptionRealtimePayload>).detail;
      if (!detail || detail.sessionId !== sessionId) return;
      setCaptions((current) => {
        const key = `${detail.speakerUserId}:${detail.sequence}:${detail.occurredAt}`;
        if (
          current.some(
            (caption) =>
              `${caption.speakerUserId}:${caption.sequence}:${caption.occurredAt}` ===
              key,
          )
        ) {
          return current;
        }
        return [...current, detail].slice(-40);
      });
    };

    const onError = (event: Event) => {
      const detail = (event as CustomEvent<LiveCaptionErrorPayload>).detail;
      if (!detail || detail.sessionId !== sessionId) return;
      setError(detail.message);
    };

    window.addEventListener(captionEvent, onCaption);
    window.addEventListener(errorEvent, onError);
    return () => {
      window.removeEventListener(captionEvent, onCaption);
      window.removeEventListener(errorEvent, onError);
      runningRef.current = false;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        try {
          recorder.stop();
        } catch {
          // Best-effort teardown.
        }
      }
      for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    };
  }, [sessionId]);

  const startPublishing = async () => {
    setError(null);
    if (!canPublish) {
      setError('Join the live media stage before publishing your captions.');
      return;
    }
    if (
      typeof MediaRecorder === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setError('This browser does not support live caption audio capture.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      streamRef.current = stream;
      runningRef.current = true;
      setPublishing(true);

      const captureNext = () => {
        const activeStream = streamRef.current;
        if (!runningRef.current || !activeStream) return;

        const mimeType = preferredMimeType();
        let recorder: MediaRecorder;
        try {
          recorder = mimeType
            ? new MediaRecorder(activeStream, { mimeType })
            : new MediaRecorder(activeStream);
        } catch {
          setError('The browser could not create a supported live-caption recorder.');
          stopPublishing();
          return;
        }

        recorderRef.current = recorder;
        const chunks: BlobPart[] = [];
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.push(event.data);
        };
        recorder.onerror = () => {
          setError('Microphone recording failed while generating live captions.');
        };
        recorder.onstop = () => {
          const actualType = recorder.mimeType || mimeType || 'audio/webm';
          const blob = new Blob(chunks, { type: actualType });
          if (blob.size > 0) {
            void blob.arrayBuffer().then((audio) => {
              const sent = publishCaptionAudio(sessionId, {
                sequence: sequenceRef.current++,
                mimeType: actualType,
                language: language.trim() || null,
                audio,
              });
              if (!sent && runningRef.current) {
                setError('Realtime connection is unavailable. Reconnect the session.');
              }
            });
          }

          if (runningRef.current) {
            timerRef.current = window.setTimeout(captureNext, CHUNK_GAP_MS);
          }
        };

        recorder.start();
        timerRef.current = window.setTimeout(() => {
          if (recorder.state === 'recording') recorder.stop();
        }, CHUNK_DURATION_MS);
      };

      captureNext();
    } catch (caught: unknown) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Microphone permission is required for live captions.',
      );
      stopPublishing();
    }
  };

  return (
    <section className="live-caption-panel" aria-live="polite">
      <div className="live-caption-heading">
        <div>
          <span className="eyebrow">Live captions</span>
          <strong>
            {publishing ? 'Your microphone is being captioned' : 'Realtime transcript'}
          </strong>
        </div>
        <div className="live-caption-actions">
          <label>
            Language
            <input
              value={language}
              maxLength={32}
              disabled={publishing}
              onChange={(event) => setLanguage(event.target.value)}
              aria-label="Live caption language"
            />
          </label>
          <button
            type="button"
            className={publishing ? 'caption-stop' : 'caption-start'}
            disabled={!canPublish && !publishing}
            onClick={() => {
              if (publishing) stopPublishing();
              else void startPublishing();
            }}
          >
            {publishing ? 'Stop my captions' : 'Start my captions'}
          </button>
        </div>
      </div>

      <div className="live-caption-lines">
        {captions.length === 0 ? (
          <p>
            Captions from participants will appear here. Publishing is opt-in and sends
            short microphone chunks to the configured speech-to-text provider.
          </p>
        ) : (
          captions.slice(-5).map((caption) => (
            <article
              key={`${caption.speakerUserId}:${caption.sequence}:${caption.occurredAt}`}
            >
              <strong>{caption.speakerName}</strong>
              <span>{caption.text}</span>
            </article>
          ))
        )}
      </div>

      {error ? <div className="live-caption-error">{error}</div> : null}
    </section>
  );
}
