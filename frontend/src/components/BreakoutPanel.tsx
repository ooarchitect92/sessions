import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useMemo, useState } from 'react';
import { api } from '../api/client';

export function BreakoutPanel({
  sessionId,
  onJoinBreakout,
  onReturnMain,
}: {
  sessionId: string;
  onJoinBreakout: (roomId: string) => void;
  onReturnMain: () => void;
}) {
  const queryClient = useQueryClient();
  const [roomName, setRoomName] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [announcement, setAnnouncement] = useState('');

  const auth = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => api.authMe(),
    staleTime: 60_000,
  });
  const members = useQuery({
    queryKey: ['workspace-members'],
    queryFn: () => api.listWorkspaceMembers(),
    staleTime: 60_000,
  });
  const breakouts = useQuery({
    queryKey: ['breakouts', sessionId],
    queryFn: () => api.getBreakouts(sessionId),
  });

  const isHost = Boolean(
    auth.data?.principal.roles.some((role) =>
      ['OWNER', 'ADMIN', 'HOST'].includes(role),
    ),
  );

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['breakouts', sessionId] });

  const createRoom = useMutation({
    mutationFn: () => api.createBreakoutRoom(sessionId, roomName),
    onSuccess: async () => {
      setRoomName('');
      await invalidate();
    },
  });
  const assign = useMutation({
    mutationFn: () => api.assignBreakout(sessionId, selectedUserId, selectedRoomId),
    onSuccess: invalidate,
  });
  const randomize = useMutation({
    mutationFn: () =>
      api.randomizeBreakouts(
        sessionId,
        members.data?.map((member) => member.user.id) ?? [],
      ),
    onSuccess: invalidate,
  });
  const open = useMutation({
    mutationFn: () => api.openBreakouts(sessionId),
    onSuccess: invalidate,
  });
  const close = useMutation({
    mutationFn: () => api.closeBreakouts(sessionId),
    onSuccess: invalidate,
  });
  const broadcast = useMutation({
    mutationFn: () => api.broadcastBreakout(sessionId, announcement),
    onSuccess: async () => {
      setAnnouncement('');
      await invalidate();
    },
  });

  const activeRooms = useMemo(
    () => breakouts.data?.rooms.filter((room) => room.status === 'OPEN') ?? [],
    [breakouts.data],
  );

  const submitRoom = (event: FormEvent) => {
    event.preventDefault();
    if (roomName.trim()) createRoom.mutate();
  };

  const submitBroadcast = (event: FormEvent) => {
    event.preventDefault();
    if (announcement.trim()) broadcast.mutate();
  };

  if (breakouts.isLoading) {
    return <div className="collaboration-scroll"><p className="side-muted">Loading breakout rooms…</p></div>;
  }

  if (breakouts.error) {
    return (
      <div className="collaboration-scroll">
        <div className="error-banner">{breakouts.error.message}</div>
      </div>
    );
  }

  const state = breakouts.data;

  return (
    <div className="collaboration-column breakout-panel">
      <div className="collaboration-scroll breakout-scroll">
        <section className="breakout-summary">
          <div>
            <strong>Breakout rooms</strong>
            <span>{state?.rooms.length ?? 0} rooms · {activeRooms.length} open</span>
          </div>
          {state?.currentAssignment ? (
            <div className="breakout-assignment-card">
              <span>Your room</span>
              <strong>{state.currentAssignment.room.name}</strong>
              <small>{state.currentAssignment.room.status.toLowerCase()}</small>
              {state.currentAssignment.room.status === 'OPEN' ? (
                <button
                  type="button"
                  onClick={() => onJoinBreakout(state.currentAssignment!.breakoutRoomId)}
                >
                  Join breakout
                </button>
              ) : null}
              <button type="button" className="subtle" onClick={onReturnMain}>
                Return to main room
              </button>
            </div>
          ) : (
            <p className="side-muted">You are not assigned to a breakout room.</p>
          )}
        </section>

        {state?.rooms.map((room) => (
          <article className="breakout-room-card" key={room.id}>
            <div className="breakout-room-heading">
              <div>
                <strong>{room.name}</strong>
                <span>{room.participantCount} assigned</span>
              </div>
              <small className={`breakout-status breakout-${room.status.toLowerCase()}`}>
                {room.status.toLowerCase()}
              </small>
            </div>
            {isHost && room.assignments.length ? (
              <ul>
                {room.assignments.map((assignment) => (
                  <li key={assignment.id}>{assignment.user.displayName}</li>
                ))}
              </ul>
            ) : null}
            {isHost && room.status === 'OPEN' ? (
              <button type="button" onClick={() => onJoinBreakout(room.id)}>
                Join as host
              </button>
            ) : null}
          </article>
        ))}

        {state?.announcements.length ? (
          <section className="breakout-announcements">
            <strong>Host announcements</strong>
            {state.announcements.map((item) => (
              <article key={item.id}>
                <p>{item.body}</p>
                <small>
                  {item.author.displayName} ·{' '}
                  {new Intl.DateTimeFormat(undefined, {
                    hour: 'numeric',
                    minute: '2-digit',
                  }).format(new Date(item.createdAt))}
                </small>
              </article>
            ))}
          </section>
        ) : null}
      </div>

      {isHost ? (
        <div className="breakout-host-controls">
          <form onSubmit={submitRoom}>
            <input
              value={roomName}
              onChange={(event) => setRoomName(event.target.value)}
              maxLength={160}
              placeholder="New breakout room"
            />
            <button disabled={createRoom.isPending || !roomName.trim()}>Add room</button>
          </form>

          <div className="breakout-assignment-controls">
            <select
              value={selectedUserId}
              onChange={(event) => setSelectedUserId(event.target.value)}
            >
              <option value="">Participant</option>
              {members.data?.map((member) => (
                <option key={member.user.id} value={member.user.id}>
                  {member.user.displayName}
                </option>
              ))}
            </select>
            <select
              value={selectedRoomId}
              onChange={(event) => setSelectedRoomId(event.target.value)}
            >
              <option value="">Room</option>
              {state?.rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={assign.isPending || !selectedUserId || !selectedRoomId}
              onClick={() => assign.mutate()}
            >
              Assign
            </button>
          </div>

          <div className="breakout-lifecycle-actions">
            <button
              type="button"
              disabled={
                randomize.isPending ||
                !members.data?.length ||
                !state?.rooms.length
              }
              onClick={() => randomize.mutate()}
            >
              Randomize
            </button>
            <button
              type="button"
              disabled={open.isPending || !state?.rooms.length}
              onClick={() => open.mutate()}
            >
              Open rooms
            </button>
            <button
              type="button"
              disabled={close.isPending || !activeRooms.length}
              onClick={() => close.mutate()}
            >
              Close rooms
            </button>
          </div>

          <form className="breakout-broadcast-form" onSubmit={submitBroadcast}>
            <input
              value={announcement}
              onChange={(event) => setAnnouncement(event.target.value)}
              maxLength={2000}
              placeholder="Broadcast to all breakout rooms"
            />
            <button
              disabled={
                broadcast.isPending ||
                !announcement.trim() ||
                !activeRooms.length
              }
            >
              Send
            </button>
          </form>

          {createRoom.error || assign.error || randomize.error || open.error || close.error || broadcast.error ? (
            <div className="error-banner">
              {(createRoom.error ?? assign.error ?? randomize.error ?? open.error ?? close.error ?? broadcast.error)?.message}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
