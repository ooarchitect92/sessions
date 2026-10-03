import { useEffect, useRef, useState } from 'react';

export interface MediaJoinPreferences {
  audioEnabled: boolean;
  videoEnabled: boolean;
  audioDeviceId?: string;
  videoDeviceId?: string;
}

interface DevicePreflightProps {
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onJoin: (preferences: MediaJoinPreferences) => void;
}

function stopStream(stream: MediaStream | null): void {
  for (const track of stream?.getTracks() ?? []) track.stop();
}

export function DevicePreflight({
  busy = false,
  error,
  onCancel,
  onJoin,
}: DevicePreflightProps) {
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDeviceId, setAudioDeviceId] = useState('');
  const [videoDeviceId, setVideoDeviceId] = useState('');
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [permissionState, setPermissionState] = useState<
    'idle' | 'checking' | 'ready' | 'error'
  >('idle');
  const [deviceError, setDeviceError] = useState<string | null>(null);

  const refreshDevices = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setDeviceError('This browser does not support media device discovery.');
      setPermissionState('error');
      return;
    }

    const available = await navigator.mediaDevices.enumerateDevices();
    setDevices(available);
    const microphones = available.filter((device) => device.kind === 'audioinput');
    const cameras = available.filter((device) => device.kind === 'videoinput');

    setAudioDeviceId((current) =>
      current && microphones.some((device) => device.deviceId === current)
        ? current
        : microphones[0]?.deviceId ?? '',
    );
    setVideoDeviceId((current) =>
      current && cameras.some((device) => device.deviceId === current)
        ? current
        : cameras[0]?.deviceId ?? '',
    );
  };

  const testDevices = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setDeviceError('Camera and microphone access is unavailable in this browser.');
      setPermissionState('error');
      return;
    }

    setPermissionState('checking');
    setDeviceError(null);
    stopStream(streamRef.current);
    streamRef.current = null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioEnabled
          ? {
              ...(audioDeviceId
                ? { deviceId: { exact: audioDeviceId } }
                : {}),
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            }
          : false,
        video: videoEnabled
          ? {
              ...(videoDeviceId
                ? { deviceId: { exact: videoDeviceId } }
                : {}),
            }
          : false,
      });

      streamRef.current = stream;
      if (previewRef.current) {
        previewRef.current.srcObject = stream;
      }
      await refreshDevices();
      setPermissionState('ready');
    } catch (caught: unknown) {
      const message =
        caught instanceof DOMException
          ? caught.name === 'NotAllowedError'
            ? 'Camera or microphone permission was denied. Allow access in your browser and try again.'
            : `${caught.name}: ${caught.message}`
          : caught instanceof Error
            ? caught.message
            : 'Unable to open the selected camera or microphone.';
      setDeviceError(message);
      setPermissionState('error');
    }
  };

  useEffect(() => {
    void refreshDevices();
    const mediaDevices = navigator.mediaDevices;
    const handleDeviceChange = () => void refreshDevices();
    mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);

    return () => {
      mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (permissionState !== 'ready') return;
    void testDevices();
    // Recreate the preview only after the user has already granted permission.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioDeviceId, videoDeviceId, audioEnabled, videoEnabled]);

  const microphones = devices.filter((device) => device.kind === 'audioinput');
  const cameras = devices.filter((device) => device.kind === 'videoinput');

  return (
    <div className="device-preflight-backdrop" role="presentation">
      <section
        className="device-preflight"
        role="dialog"
        aria-modal="true"
        aria-labelledby="device-preflight-title"
      >
        <div className="device-preflight-heading">
          <div>
            <span className="eyebrow">Device preflight</span>
            <h2 id="device-preflight-title">Check camera and microphone</h2>
            <p>
              Preview your devices before joining. Your browser permission is used
              locally for this check; the meeting connection starts only after you
              choose Join.
            </p>
          </div>
          <button type="button" className="preflight-close" onClick={onCancel}>
            ×
          </button>
        </div>

        <div className="device-preflight-grid">
          <div className="device-preview">
            <video ref={previewRef} autoPlay muted playsInline />
            {!videoEnabled ? (
              <div className="device-preview-disabled">Camera off</div>
            ) : permissionState !== 'ready' ? (
              <div className="device-preview-disabled">
                {permissionState === 'checking' ? 'Opening devices…' : 'Preview not started'}
              </div>
            ) : null}
          </div>

          <div className="device-preflight-controls">
            <label className="preflight-toggle">
              <input
                type="checkbox"
                checked={videoEnabled}
                onChange={(event) => setVideoEnabled(event.target.checked)}
              />
              <span>Join with camera</span>
            </label>
            <label>
              Camera
              <select
                value={videoDeviceId}
                disabled={!videoEnabled || cameras.length === 0}
                onChange={(event) => setVideoDeviceId(event.target.value)}
              >
                {cameras.length === 0 ? (
                  <option value="">No camera detected</option>
                ) : (
                  cameras.map((device, index) => (
                    <option key={device.deviceId || `camera-${index}`} value={device.deviceId}>
                      {device.label || `Camera ${index + 1}`}
                    </option>
                  ))
                )}
              </select>
            </label>

            <label className="preflight-toggle">
              <input
                type="checkbox"
                checked={audioEnabled}
                onChange={(event) => setAudioEnabled(event.target.checked)}
              />
              <span>Join with microphone</span>
            </label>
            <label>
              Microphone
              <select
                value={audioDeviceId}
                disabled={!audioEnabled || microphones.length === 0}
                onChange={(event) => setAudioDeviceId(event.target.value)}
              >
                {microphones.length === 0 ? (
                  <option value="">No microphone detected</option>
                ) : (
                  microphones.map((device, index) => (
                    <option key={device.deviceId || `microphone-${index}`} value={device.deviceId}>
                      {device.label || `Microphone ${index + 1}`}
                    </option>
                  ))
                )}
              </select>
            </label>

            <div className="preflight-status">
              <span
                className={`preflight-status-dot preflight-status-${permissionState}`}
                aria-hidden="true"
              />
              <span>
                {permissionState === 'ready'
                  ? 'Devices are ready'
                  : permissionState === 'checking'
                    ? 'Checking devices…'
                    : permissionState === 'error'
                      ? 'Device check needs attention'
                      : 'Run a device check before joining'}
              </span>
            </div>

            {deviceError ? <div className="error-banner compact-error">{deviceError}</div> : null}
            {error ? <div className="error-banner compact-error">{error}</div> : null}

            <div className="device-preflight-actions">
              <button
                type="button"
                className="button secondary"
                disabled={busy || permissionState === 'checking'}
                onClick={() => void testDevices()}
              >
                {permissionState === 'checking' ? 'Checking…' : 'Test devices'}
              </button>
              <button
                type="button"
                className="button primary"
                disabled={
                  busy ||
                  (audioEnabled && microphones.length === 0) ||
                  (videoEnabled && cameras.length === 0)
                }
                onClick={() => {
                  stopStream(streamRef.current);
                  streamRef.current = null;
                  onJoin({
                    audioEnabled,
                    videoEnabled,
                    ...(audioDeviceId ? { audioDeviceId } : {}),
                    ...(videoDeviceId ? { videoDeviceId } : {}),
                  });
                }}
              >
                {busy ? 'Joining…' : 'Join meeting'}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
