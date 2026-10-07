import { useEffect, useRef, useState } from 'react';
import { api, type LiveTranscriptSegment } from '../api/client';

const CHUNK_MS = 4000;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read audio chunk'));
    reader.onloadend = () => {
      const value = reader.result;
      if (typeof value !== 'string') {
        reject(new Error('Unable to encode audio chunk'));
        return;
      }
      resolve(value.slice(value.indexOf(',') + 1));
    };
    reader.readAsDataURL(blob);
  });
}

function preferredMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
  ];
  return (
    candidates.find(
      (candidate) =>
        typeof MediaRecorder !== 'undefined' &&
        MediaRecorder.isTypeSupported(candidate),
    ) ?? ''
  );
}

export function LiveCaptionsPanel({
  sessionId,
  enabled,
  live,
}: {
  sessionId: string;
  enabled: boolean;
  live: boolean;
}) {
  const [capturing, setCapturing] = useState(false);
  const [segments, setSegments] = useState<LiveTranscriptSegment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sequenceRef = useRef(0);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<LiveTranscriptSegment>).detail;
      if (!detail?.segmentId || !detail.text) return;
      setSegments((current) => {
        const next = current.some((item) => item.segmentId === detail.segmentId)
          ? current
          : [...current, detail];
        return next.slice(-8);
      });
    };
    window.addEventListener('sessions:live-caption', handler);
    return () => window.removeEventListener('sessions:live-caption', handler);
  }, []);

  useEffect(
    () => () => {
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  const stop = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCapturing(false);
  };

  const start = async () => {
    setError(null);
    if (!enabled) {
      setError('Transcription is not enabled for this session.');
      return;
    }
    if (!live) {
      setError('Live captions can start only after the session is live.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('This browser does not support live microphone caption capture.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      sequenceRef.current = 0;
      const mimeType = preferredMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      recorderRef.current = recorder;

      recorder.addEventListener('dataavailable', (event) => {
        if (!event.data.size) return;
        const sequence = sequenceRef.current++;
        void blobToBase64(event.data)
          .then((audioBase64) =>
            api.submitLiveTranscriptionChunk(sessionId, {
              sequence,
              startMs: sequence * CHUNK_MS,
              mimeType: event.data.type || mimeType || 'audio/webm',
              audioBase64,
            }),
          )
          .catch((reason: unknown) => {
            setError(reason instanceof Error ? reason.message : 'Live caption upload failed');
          });
      });
      recorder.addEventListener('stop', () => {
        stream.getTracks().forEach((track) => track.stop());
      });
      recorder.start(CHUNK_MS);
      setCapturing(true);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Microphone permission is required for live captions.',
      );
      stop();
    }
  };

  if (!enabled) {
    return (
      <div className="live-captions-panel disabled">
        <span className="eyebrow">Live captions</span>
        <p>Transcription is disabled for this session.</p>
      </div>
    );
  }

  return (
    <div className="live-captions-panel" aria-live="polite">
      <div className="live-captions-heading">
        <div>
          <span className="eyebrow">Live captions</span>
          <strong>{capturing ? 'Capturing your microphone' : 'Realtime transcript'}</strong>
        </div>
        <button
          type="button"
          className={capturing ? 'button danger' : 'button secondary'}
          onClick={capturing ? stop : () => void start()}
          disabled={!live}
        >
          {capturing ? 'Stop captions' : 'Start captions'}
        </button>
      </div>
      {segments.length ? (
        <div className="live-caption-lines">
          {segments.map((segment) => (
            <div key={segment.segmentId} className="live-caption-line">
              <strong>{segment.speakerLabel || segment.displayName || 'Speaker'}</strong>
              <span>{segment.text}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="live-caption-empty">
          {live
            ? 'Start captions to stream short audio chunks for low-latency transcription.'
            : 'Start the session to enable live captions.'}
        </p>
      )}
      {error ? <div className="error-banner compact-error">{error}</div> : null}
    </div>
  );
}
