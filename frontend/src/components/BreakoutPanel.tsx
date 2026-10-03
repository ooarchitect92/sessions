import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useMemo, useState } from 'react';
import { api, type SessionPresenceParticipant } from '../api/client';

export function BreakoutPanel({
  sessionId,
  participants,
  onJoinBreakout,
  onReturnToMain,
}: {
  sessionId: string;
  participants: SessionPresenceParticipant[];
  onJoinBreakout: (breakoutRoomId: string) => void;
  onReturnToMain: () => void;
}) {
  const queryClient = useQueryClient();
  const [roomNames, setRoomNames] = useState('Room 1\nRoom 2');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const state = useQuery({
    queryKey: ['breakouts', sessionId],
    queryFn: () => api.getBreakoutState(sessionId),
    refetchInterval: 15_000,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['breakouts', sessionId] });
  };

  const createRooms = useMutation({
    mutationFn: () =>
      api.createBreakoutRooms(
        sessionId,
        roomNames
          .split('\n')
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    onSuccess: refresh,
  });
  const randomize = useMutation({
    mutationFn: () => api.randomizeBreakoutAssignments(sessionId),
    onSuccess: refresh,
  });
  const assign = useMutation({
    mutationFn: ({
      userId,
      breakoutRoomId,
    }: {
      userId: string;
      breakoutRoomId: string;
    }) => api.assignBreakoutParticipant(sessionId, userId, breakoutRoomId),
    onSuccess: refresh,
  });
  const openRooms = useMutation({
    mutationFn: () => api.openBreakouts(sessionId),
    onSuccess: refresh,
  });
  const closeRooms = useMutation({
    mutationFn: () => api.closeBreakouts(sessionId),
    onSuccess: async () => {
      await refresh();
      onReturnToMain();
    },
  });
  const broadcast = useMutation({
    mutationFn: () =>
      api.broadcastBreakoutMessage(sessionId, broadcastMessage.trim()),
    onSuccess: () => setBroadcastMessage(''),
  });

  const error = [
    state.error,
    createRooms.error,
    randomize.error,
    assign.error,
    openRooms.error,
    closeRooms.error,
    broadcast.error,
  ].find((value): value is Error => value instanceof Error);

  const activeRoomCount = useMemo(
    () => state.data?.rooms.filter((room) => room.status === 'ACTIVE').length ?? 0,
    [state.data?.rooms],
  );

  const submitBroadcast = (event: FormEvent) => {
    event.preventDefault();
    if (broadcastMessage.trim()) broadcast.mutate();
  };

  if (state.isLoading) {
    return <p className="side-muted">Loading breakout rooms…</p>;
  }

  if (!state.data) {
    return (
      <div className="collaboration-scroll">
        <div className="error-banner compact-error">
          {error?.message ?? 'Breakout room state is unavailable.'}
        </div>
      </div>
    );
  }

  const breakoutState = state.data;

  if (!breakoutState.canManage) {
    const assignment = breakoutState.ownAssignment;
    return (
      <div className="collaboration-column">
        <div className="collaboration-scroll">
          <div className="side-panel-note">
            <strong>Breakout room</strong>
            {assignment ? (
              <>
                <p>
                  You are assigned to <strong>{assignment.breakoutRoom.name}</strong>.
                </p>
                <p>
                  Status: {assignment.breakoutRoom.status.toLowerCase()}.
                </p>
                <button
                  type="button"
                  className="button primary full-width"
                  disabled={assignment.breakoutRoom.status !== 'ACTIVE'}
                  onClick={() => onJoinBreakout(assignment.breakoutRoomId)}
                >
                  Join breakout
                </button>
                <button
                  type="button"
                  className="button secondary full-width"
                  onClick={onReturnToMain}
                >
                  Return to main room
                </button>
              </>
            ) : (
              <p>The host has not assigned you to a breakout room yet.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="collaboration-column">
      <div className="collaboration-scroll breakout-panel">
        <div className="side-panel-note">
          <strong>Breakout orchestration</strong>
          <p>
            Create rooms, assign active participants, open isolated LiveKit rooms,
            broadcast host messages, and return everyone to the main meeting.
          </p>
        </div>

        <label className="breakout-room-builder">
          Room names
          <textarea
            rows={4}
            value={roomNames}
            onChange={(event) => setRoomNames(event.target.value)}
            placeholder={'Room 1\nRoom 2'}
          />
        </label>
        <button
          type="button"
          className="button secondary full-width"
          disabled={
            createRooms.isPending ||
            roomNames
              .split('\n')
              .map((value) => value.trim())
              .filter(Boolean).length < 2 ||
            activeRoomCount > 0
          }
          onClick={() => createRooms.mutate()}
        >
          {createRooms.isPending ? 'Creating…' : 'Create / replace rooms'}
        </button>

        <div className="breakout-actions-grid">
          <button
            type="button"
            disabled={randomize.isPending || breakoutState.rooms.length < 2}
            onClick={() => randomize.mutate()}
          >
            Random assign
          </button>
          <button
            type="button"
            disabled={openRooms.isPending || breakoutState.rooms.length < 2}
            onClick={() => openRooms.mutate()}
          >
            Open rooms
          </button>
          <button
            type="button"
            disabled={closeRooms.isPending || activeRoomCount === 0}
            onClick={() => closeRooms.mutate()}
          >
            Close rooms
          </button>
        </div>

        <div className="breakout-room-list">
          {breakoutState.rooms.map((room) => (
            <article className="breakout-room-card" key={room.id}>
              <div className="breakout-room-heading">
                <strong>{room.name}</strong>
                <span>{room.status.toLowerCase()}</span>
              </div>
              <div className="breakout-assignment-list">
                {participants
                  .filter(
                    (participant) =>
                      room.assignments?.some(
                        (assignment) => assignment.userId === participant.userId,
                      ) ?? false,
                  )
                  .map((participant) => (
                    <div key={participant.userId}>
                      <span>{participant.displayName}</span>
                      <select
                        value={room.id}
                        aria-label={'Move ' + participant.displayName}
                        disabled={assign.isPending}
                        onChange={(event) =>
                          assign.mutate({
                            userId: participant.userId,
                            breakoutRoomId: event.target.value,
                          })
                        }
                      >
                        {breakoutState.rooms.map((candidate) => (
                          <option value={candidate.id} key={candidate.id}>
                            {candidate.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                {(room.assignments?.length ?? 0) === 0 ? (
                  <small>No participants assigned.</small>
                ) : null}
              </div>
              {room.status === 'ACTIVE' ? (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => onJoinBreakout(room.id)}
                >
                  Host enter room
                </button>
              ) : null}
            </article>
          ))}
        </div>

        {breakoutState.rooms.length > 0 ? (
          <div className="breakout-unassigned">
            <strong>Unassigned participants</strong>
            {participants
              .filter(
                (participant) =>
                  !breakoutState.rooms.some(
                    (room) =>
                      room.assignments?.some(
                        (assignment) => assignment.userId === participant.userId,
                      ) ?? false,
                  ),
              )
              .map((participant) => (
                <div key={participant.userId}>
                  <span>{participant.displayName}</span>
                  <select
                    defaultValue=""
                    disabled={assign.isPending}
                    onChange={(event) => {
                      if (event.target.value) {
                        assign.mutate({
                          userId: participant.userId,
                          breakoutRoomId: event.target.value,
                        });
                      }
                    }}
                  >
                    <option value="">Assign…</option>
                    {breakoutState.rooms.map((room) => (
                      <option value={room.id} key={room.id}>
                        {room.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
          </div>
        ) : null}

        {activeRoomCount > 0 ? (
          <form className="side-builder" onSubmit={submitBroadcast}>
            <textarea
              maxLength={1000}
              value={broadcastMessage}
              onChange={(event) => setBroadcastMessage(event.target.value)}
              placeholder="Broadcast a message to all breakout participants"
            />
            <button disabled={broadcast.isPending || !broadcastMessage.trim()}>
              Broadcast
            </button>
          </form>
        ) : null}

        {error ? <div className="error-banner compact-error">{error.message}</div> : null}
      </div>
    </div>
  );
}
