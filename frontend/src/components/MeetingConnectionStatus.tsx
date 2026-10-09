import { useConnectionState } from '@livekit/components-react';
import { useEffect, useState } from 'react';

export function MeetingConnectionStatus({
  error,
  retrying,
  onRetry,
}: {
  error?: string | null;
  retrying: boolean;
  onRetry: () => void;
}) {
  const state = useConnectionState();
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const connectionState = String(state);
  const healthy = online && connectionState === 'connected' && !error;
  if (healthy) return null;

  const title = !online
    ? 'Network connection lost'
    : connectionState === 'reconnecting'
      ? 'Reconnecting media…'
      : connectionState === 'connecting'
        ? 'Connecting media…'
        : error
          ? 'Media connection needs attention'
          : 'Media disconnected';

  const detail = !online
    ? 'The meeting will attempt to recover when your browser is online again.'
    : error
      ? error
      : connectionState === 'reconnecting'
        ? 'LiveKit is restoring the room connection and published tracks automatically.'
        : connectionState === 'connecting'
          ? 'Negotiating a secure WebRTC connection to the media room.'
          : 'Request a fresh room token and reconnect without leaving the session page.';

  const canRetry =
    online &&
    !retrying &&
    connectionState !== 'connecting' &&
    connectionState !== 'reconnecting';

  return (
    <div
      className={`meeting-connection-banner state-${connectionState}`}
      role="status"
      aria-live="polite"
    >
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      {canRetry ? (
        <button type="button" onClick={onRetry}>
          Retry connection
        </button>
      ) : null}
    </div>
  );
}
