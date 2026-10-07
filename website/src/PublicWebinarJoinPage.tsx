import { useEffect, useRef, useState } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
} from 'livekit-client';
import { publicApi } from './public-api';

interface Admission {
  url: string;
  token: string;
  expiresIn: number;
  expiresAt: string;
  sessionId: string;
  event: {
    id: string;
    title: string;
    startsAt: string;
    timezone: string;
  };
}

export function PublicWebinarJoinPage({
  organizationSlug,
  workspaceSlug,
  eventSlug,
  registrationId,
}: {
  organizationSlug: string;
  workspaceSlug: string;
  eventSlug: string;
  registrationId: string;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const roomRef = useRef<Room | null>(null);
  const [event, setEvent] = useState<Admission['event'] | null>(null);
  const [state, setState] = useState<'joining' | 'connected' | 'error'>('joining');
  const [message, setMessage] = useState('Preparing your webinar seat…');

  useEffect(() => {
    let cancelled = false;
    const admissionToken = new URLSearchParams(window.location.search).get('token');
    if (!admissionToken) {
      setState('error');
      setMessage('This webinar link is incomplete.');
      return;
    }

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
    });
    roomRef.current = room;

    const attach = (track: RemoteTrack) => {
      const element = track.attach();
      element.autoplay = true;
      element.playsInline = true;
      if (track.kind === Track.Kind.Video) {
        element.classList.add('public-webinar-video');
      } else {
        element.classList.add('public-webinar-audio');
      }
      stageRef.current?.appendChild(element);
    };
    const detach = (track: RemoteTrack) => {
      for (const element of track.detach()) {
        element.remove();
      }
    };

    room.on(RoomEvent.TrackSubscribed, attach);
    room.on(RoomEvent.TrackUnsubscribed, detach);
    room.on(RoomEvent.Disconnected, () => {
      if (!cancelled) {
        setState('error');
        setMessage('You were disconnected from the webinar.');
      }
    });

    publicApi<Admission>(
      `/public/${encodeURIComponent(organizationSlug)}/${encodeURIComponent(
        workspaceSlug,
      )}/events/${encodeURIComponent(eventSlug)}/admission`,
      {
        method: 'POST',
        body: JSON.stringify({
          registrationId,
          admissionToken,
        }),
      },
    )
      .then(async (admission) => {
        if (cancelled) return;
        setEvent(admission.event);
        await room.connect(admission.url, admission.token);
        if (cancelled) return;
        for (const participant of room.remoteParticipants.values()) {
          for (const publication of participant.trackPublications.values()) {
            if (publication.track) attach(publication.track);
          }
        }
        setState('connected');
        setMessage('You are connected as an attendee.');
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setState('error');
        setMessage(caught instanceof Error ? caught.message : 'Unable to join the webinar.');
      });

    return () => {
      cancelled = true;
      room.off(RoomEvent.TrackSubscribed, attach);
      room.off(RoomEvent.TrackUnsubscribed, detach);
      void room.disconnect();
      stageRef.current?.replaceChildren();
    };
  }, [eventSlug, organizationSlug, registrationId, workspaceSlug]);

  return (
    <main className="public-webinar-page">
      <header className="public-webinar-header">
        <a className="public-wordmark" href="/">
          <span>S</span>
          <strong>Sessions</strong>
        </a>
        <span className={`public-webinar-state ${state}`}>{message}</span>
      </header>

      <section className="public-webinar-shell">
        <div className="public-webinar-copy">
          <span className="public-kicker">Webinar attendee view</span>
          <h1>{event?.title ?? 'Joining webinar…'}</h1>
          {event ? (
            <p>
              {new Intl.DateTimeFormat(undefined, {
                dateStyle: 'full',
                timeStyle: 'short',
              }).format(new Date(event.startsAt))}{' '}
              · {event.timezone}
            </p>
          ) : null}
        </div>

        <div className="public-webinar-stage" ref={stageRef}>
          {state !== 'connected' ? (
            <div className="public-webinar-placeholder">
              <strong>{state === 'error' ? 'Unable to enter the webinar' : 'Connecting…'}</strong>
              <p>{message}</p>
            </div>
          ) : (
            <div className="public-webinar-placeholder waiting">
              <strong>Connected</strong>
              <p>Presenter video and shared media will appear here when the host broadcasts.</p>
            </div>
          )}
        </div>

        <aside className="public-webinar-attendee-note">
          <strong>Attendee mode</strong>
          <p>
            Your admission is subscribe-only. Camera and microphone publishing are disabled for
            attendee accounts; hosts and speakers control the webinar stage.
          </p>
        </aside>
      </section>
    </main>
  );
}
