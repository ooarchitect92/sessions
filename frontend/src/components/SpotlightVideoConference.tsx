import {
  ControlBar,
  GridLayout,
  ParticipantTile,
  RoomAudioRenderer,
  VideoConference,
  useTracks,
} from '@livekit/components-react';
import { Track } from 'livekit-client';

export function SpotlightVideoConference() {
  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ]);

  const spotlightIdentity = tracks.find(
    (trackRef) =>
      trackRef.participant.attributes?.['sessions.spotlighted'] === 'true',
  )?.participant.identity;

  if (!spotlightIdentity) {
    return <VideoConference />;
  }

  const spotlightCandidates = tracks.filter(
    (trackRef) => trackRef.participant.identity === spotlightIdentity,
  );
  const spotlightTrack =
    spotlightCandidates.find(
      (trackRef) => trackRef.source === Track.Source.ScreenShare,
    ) ??
    spotlightCandidates.find(
      (trackRef) => trackRef.source === Track.Source.Camera,
    ) ??
    spotlightCandidates[0];

  if (!spotlightTrack) {
    return <VideoConference />;
  }

  const remainingTracks = tracks.filter(
    (trackRef) =>
      !(
        trackRef.participant.identity === spotlightTrack.participant.identity &&
        trackRef.source === spotlightTrack.source
      ),
  );

  return (
    <div className="lk-video-conference sessions-spotlight-conference">
      <div className="sessions-spotlight-stage">
        <div className="sessions-spotlight-label">
          <span>Spotlight</span>
          <strong>{spotlightTrack.participant.name || 'Participant'}</strong>
        </div>
        <ParticipantTile trackRef={spotlightTrack} />
      </div>

      {remainingTracks.length ? (
        <div className="sessions-spotlight-strip">
          <GridLayout tracks={remainingTracks}>
            <ParticipantTile />
          </GridLayout>
        </div>
      ) : null}

      <RoomAudioRenderer />
      <ControlBar />
    </div>
  );
}
