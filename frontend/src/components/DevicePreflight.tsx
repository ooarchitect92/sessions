import { useEffect, useMemo, useRef, useState } from 'react';

export interface DevicePreferences {
  cameraDeviceId: string | null;
  microphoneDeviceId: string | null;
  cameraEnabled: boolean;
  microphoneEnabled: boolean;
}

interface DevicePreflightProps {
  open: boolean;
  initial: DevicePreferences;
  joining?: boolean;
  onCancel: () => void;
  onJoin: (preferences: DevicePreferences) => void;
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function DevicePreflight({
  open,
  initial,
  joining = false,
  onCancel,
  onJoin,
}: DevicePreflightProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [cameraDeviceId, setCameraDeviceId] = useState(initial.cameraDeviceId);
  const [microphoneDeviceId, setMicrophoneDeviceId] = useState(
    initial.microphoneDeviceId,
  );
  const [cameraEnabled, setCameraEnabled] = useState(initial.cameraEnabled);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(
    initial.microphoneEnabled,
  );
  const [status, setStatus] = useState<
    'idle' | 'checking' | 'ready' | 'blocked' | 'unsupported'
  >('idle');
  const [message, setMessage] = useState('');

  const cameras = useMemo(
    () => devices.filter((device) => device.kind === 'videoinput'),
    [devices],
  );
  const microphones = useMemo(
    () => devices.filter((device) => device.kind === 'audioinput'),
    [devices],
  );

  useEffect(() => {
    if (!open) return;
    setCameraDeviceId(initial.cameraDeviceId);
    setMicrophoneDeviceId(initial.microphoneDeviceId);
    setCameraEnabled(initial.cameraEnabled);
    setMicrophoneEnabled(initial.microphoneEnabled);
  }, [initial, open]);

  useEffect(() => {
    if (!open) {
      stopStream(stream);
      setStream(null);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported');
      setMessage('This browser does not expose camera and microphone controls.');
      return;
    }

    let cancelled = false;
    let active: MediaStream | null = null;

    const prepare = async () => {
      setStatus('checking');
      setMessage('Checking camera and microphone permissions…');
      stopStream(stream);

      if (!cameraEnabled && !microphoneEnabled) {
        const listed = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) {
          setDevices(listed);
          setStream(null);
          setStatus('ready');
          setMessage('You can join with camera and microphone turned off.');
        }
        return;
      }

      try {
        active = await navigator.mediaDevices.getUserMedia({
          video: cameraEnabled
            ? {
                deviceId: cameraDeviceId ? { exact: cameraDeviceId } : undefined,
                width: { ideal: 1280 },
                height: { ideal: 720 },
              }
            : false,
          audio: microphoneEnabled
            ? {
                deviceId: microphoneDeviceId
                  ? { exact: microphoneDeviceId }
                  : undefined,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              }
            : false,
        });

        const listed = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) {
          stopStream(active);
          return;
        }
        setDevices(listed);
        setStream(active);
        setStatus('ready');
        setMessage('Devices are ready. Confirm your choices to enter the meeting.');

        const cameraTrack = active.getVideoTracks()[0];
        const microphoneTrack = active.getAudioTracks()[0];
        if (!cameraDeviceId && cameraTrack?.getSettings().deviceId) {
          setCameraDeviceId(cameraTrack.getSettings().deviceId ?? null);
        }
        if (!microphoneDeviceId && microphoneTrack?.getSettings().deviceId) {
          setMicrophoneDeviceId(microphoneTrack.getSettings().deviceId ?? null);
        }
      } catch (error) {
        if (cancelled) return;
        setStream(null);
        setStatus('blocked');
        setMessage(
          error instanceof DOMException && error.name === 'NotAllowedError'
            ? 'Camera or microphone permission was denied. Enable permission in your browser or turn the blocked device off.'
            : error instanceof Error
              ? error.message
              : 'Unable to access the selected camera or microphone.',
        );
      }
    };

    void prepare();

    return () => {
      cancelled = true;
      stopStream(active);
    };
    // stream is deliberately excluded: each preference change replaces it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cameraDeviceId, microphoneDeviceId, cameraEnabled, microphoneEnabled]);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.srcObject = stream;
  }, [stream]);

  useEffect(() => {
    if (!open || !navigator.mediaDevices?.addEventListener) return;
    const refresh = () => {
      void navigator.mediaDevices.enumerateDevices().then(setDevices);
    };
    navigator.mediaDevices.addEventListener('devicechange', refresh);
    return () => navigator.mediaDevices.removeEventListener('devicechange', refresh);
  }, [open]);

  if (!open) return null;

  const canJoin =
    status === 'ready' ||
    (!cameraEnabled && !microphoneEnabled && status !== 'unsupported');

  return (
    <div className="device-preflight-backdrop" role="presentation">
      <section
        className="device-preflight"
        role="dialog"
        aria-modal="true"
        aria-labelledby="device-preflight-title"
      >
        <header>
          <div>
            <span className="eyebrow">Device preflight</span>
            <h2 id="device-preflight-title">Check devices before joining</h2>
            <p>
              Preview your camera, choose the microphone and confirm browser
              permissions before a LiveKit token is used.
            </p>
          </div>
          <button
            type="button"
            className="button secondary"
            onClick={onCancel}
            disabled={joining}
          >
            Cancel
          </button>
        </header>

        <div className="device-preflight-grid">
          <div className="device-preview">
            {cameraEnabled && stream?.getVideoTracks().length ? (
              <video ref={videoRef} autoPlay muted playsInline />
            ) : (
              <div className="device-preview-placeholder">
                <strong>Camera off</strong>
                <span>You can still join with audio only.</span>
              </div>
            )}
          </div>

          <div className="device-controls">
            <div className={`device-check-status status-${status}`}>
              <strong>
                {status === 'ready'
                  ? 'Ready'
                  : status === 'checking'
                    ? 'Checking devices'
                    : status === 'blocked'
                      ? 'Permission or device issue'
                      : status === 'unsupported'
                        ? 'Unsupported browser'
                        : 'Waiting'}
              </strong>
              <span>{message}</span>
            </div>

            <label className="device-toggle-row">
              <span>
                <strong>Camera</strong>
                <small>Preview video before publishing.</small>
              </span>
              <input
                type="checkbox"
                checked={cameraEnabled}
                onChange={(event) => setCameraEnabled(event.target.checked)}
              />
            </label>

            <label>
              Camera device
              <select
                value={cameraDeviceId ?? ''}
                disabled={!cameraEnabled || status === 'checking'}
                onChange={(event) => setCameraDeviceId(event.target.value || null)}
              >
                <option value="">System default</option>
                {cameras.map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Camera ${index + 1}`}
                  </option>
                ))}
              </select>
            </label>

            <label className="device-toggle-row">
              <span>
                <strong>Microphone</strong>
                <small>Echo cancellation and noise suppression are requested.</small>
              </span>
              <input
                type="checkbox"
                checked={microphoneEnabled}
                onChange={(event) => setMicrophoneEnabled(event.target.checked)}
              />
            </label>

            <label>
              Microphone device
              <select
                value={microphoneDeviceId ?? ''}
                disabled={!microphoneEnabled || status === 'checking'}
                onChange={(event) =>
                  setMicrophoneDeviceId(event.target.value || null)
                }
              >
                <option value="">System default</option>
                {microphones.map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Microphone ${index + 1}`}
                  </option>
                ))}
              </select>
            </label>

            <div className="device-network-row">
              <strong>Network</strong>
              <span>{navigator.onLine ? 'Browser reports online' : 'Browser reports offline'}</span>
            </div>
          </div>
        </div>

        <footer>
          <small>
            Device labels appear after browser permission is granted. Your preview
            stream is stopped when you close this check.
          </small>
          <button
            type="button"
            className="button primary"
            disabled={!canJoin || joining}
            onClick={() =>
              onJoin({
                cameraDeviceId,
                microphoneDeviceId,
                cameraEnabled,
                microphoneEnabled,
              })
            }
          >
            {joining ? 'Joining…' : 'Join meeting'}
          </button>
        </footer>
      </section>
    </div>
  );
}
