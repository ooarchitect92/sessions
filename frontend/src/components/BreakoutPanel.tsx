import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useMemo, useState } from 'react';
import { api, type BreakoutRoomRecord } from '../api/client';
import { useAuth } from '../auth/AuthContext';

export function BreakoutPanel({
  sessionId,
  onJoinBreakout,
}: {
  sessionId: string;
  onJoinBreakout: (breakoutRoomId: string) => void;
}) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const roles = auth.me?.principal.roles ?? [];
  const canManage = roles.some((role) => ['OWNER', 'ADMIN', 'HOST'].includes(role));
  const [roomName, setRoomName] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);

  const rooms = useQuery({
    queryKey: ['breakouts', sessionId],
    queryFn: () => api.listBreakouts(sessionId),
  });

  const members = useQuery({
    queryKey: ['workspace-members'],
    queryFn: () => api.listWorkspaceMembers(),
    enabled: canManage,
  });

  const createRoom = useMutation({
    mutationFn: () =>
      api.createBreakout(sessionId, {
        name: roomName,
        position: rooms.data?.length ?? 0,
      }),
    onSuccess: async () => {
      setRoomName('');
      await queryClient.invalidateQueries({ queryKey: ['breakouts', sessionId] });
    },
  });

  const updateAssignments = useMutation({
    mutationFn: ({
      roomId,
      userIds,
    }: {
      roomId: string;
      userIds: string[];
    }) => api.assignBreakout(sessionId, roomId, userIds),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['breakouts', sessionId] });
    },
  });

  const randomize = useMutation({
    mutationFn: () => api.randomizeBreakouts(sessionId, selectedParticipants),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['breakouts', sessionId] });
    },
  });

  const start = useMutation({
    mutationFn: () => api.startBreakouts(sessionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['breakouts', sessionId] });
    },
  });

  const close = useMutation({
    mutationFn: () => api.closeBreakouts(sessionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['breakouts', sessionId] });
    },
  });

  const broadcast = useMutation({
    mutationFn: () => api.broadcastBreakout(sessionId, broadcastMessage),
    onSuccess: () => setBroadcastMessage(''),
  });

  const activeRooms = useMemo(
    () => rooms.data?.filter((room) => room.status === 'ACTIVE') ?? [],
    [rooms.data],
  );

  const submitRoom = (event: FormEvent) => {
    event.preventDefault();
    if (roomName.trim()) createRoom.mutate();
  };

  return (
    <div className="collaboration-column">
      <div className="collaboration-scroll breakout-panel-body">
        <div className="breakout-summary">
          <strong>{rooms.data?.length ?? 0} breakout rooms</strong>
          <small>
            {activeRooms.length
              ? `${activeRooms.length} active`
              : 'Rooms are not currently active'}
          </small>
        </div>

        {canManage ? (
          <section className="breakout-manager">
            <form className="breakout-create-row" onSubmit={submitRoom}>
              <input
                value={roomName}
                maxLength={160}
                onChange={(event) => setRoomName(event.target.value)}
                placeholder="New breakout room"
              />
              <button disabled={createRoom.isPending || !roomName.trim()}>
                Add
              </button>
            </form>

            <div className="breakout-participant-picker">
              <strong>Participants for random assignment</strong>
              <div>
                {members.data?.map((membership) => {
                  const checked = selectedParticipants.includes(membership.user.id);
                  return (
                    <label key={membership.id}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          setSelectedParticipants((current) =>
                            event.target.checked
                              ? [...current, membership.user.id]
                              : current.filter((id) => id !== membership.user.id),
                          );
                        }}
                      />
                      <span>{membership.user.displayName}</span>
                    </label>
                  );
                })}
              </div>
              <button
                type="button"
                disabled={
                  randomize.isPending ||
                  selectedParticipants.length === 0 ||
                  (rooms.data?.length ?? 0) === 0
                }
                onClick={() => randomize.mutate()}
              >
                Randomly assign selected
              </button>
            </div>

            <div className="breakout-global-actions">
              <button
                type="button"
                disabled={start.isPending || (rooms.data?.length ?? 0) === 0}
                onClick={() => start.mutate()}
              >
                Start breakouts
              </button>
              <button
                type="button"
                disabled={close.isPending || activeRooms.length === 0}
                onClick={() => close.mutate()}
              >
                Close breakouts
              </button>
            </div>

            <form
              className="breakout-broadcast-row"
              onSubmit={(event) => {
                event.preventDefault();
                if (broadcastMessage.trim()) broadcast.mutate();
              }}
            >
              <input
                maxLength={1000}
                value={broadcastMessage}
                onChange={(event) => setBroadcastMessage(event.target.value)}
                placeholder="Broadcast a message to breakout participants"
              />
              <button
                disabled={broadcast.isPending || !broadcastMessage.trim()}
              >
                Send
              </button>
            </form>
          </section>
        ) : null}

        <div className="breakout-room-list">
          {rooms.data?.map((room) => (
            <BreakoutRoomCard
              key={room.id}
              room={room}
              canManage={canManage}
              members={members.data ?? []}
              updateAssignments={(userIds) =>
                updateAssignments.mutate({ roomId: room.id, userIds })
              }
              assignmentPending={updateAssignments.isPending}
              onJoin={() => onJoinBreakout(room.id)}
            />
          ))}
          {rooms.data?.length === 0 ? (
            <p className="side-muted">No breakout rooms yet.</p>
          ) : null}
        </div>

        {rooms.error ? <div className="error-banner">{rooms.error.message}</div> : null}
        {createRoom.error ? (
          <div className="error-banner">{createRoom.error.message}</div>
        ) : null}
        {randomize.error ? (
          <div className="error-banner">{randomize.error.message}</div>
        ) : null}
        {start.error ? <div className="error-banner">{start.error.message}</div> : null}
        {close.error ? <div className="error-banner">{close.error.message}</div> : null}
        {broadcast.error ? (
          <div className="error-banner">{broadcast.error.message}</div>
        ) : null}
      </div>
    </div>
  );
}

function BreakoutRoomCard({
  room,
  canManage,
  members,
  updateAssignments,
  assignmentPending,
  onJoin,
}: {
  room: BreakoutRoomRecord;
  canManage: boolean;
  members: Awaited<ReturnType<typeof api.listWorkspaceMembers>>;
  updateAssignments: (userIds: string[]) => void;
  assignmentPending: boolean;
  onJoin: () => void;
}) {
  const [draftAssignments, setDraftAssignments] = useState<string[]>(
    room.assignments.map((assignment) => assignment.userId),
  );

  return (
    <article className="breakout-room-card">
      <div className="breakout-room-heading">
        <div>
          <strong>{room.name}</strong>
          <small>{room.assignments.length} assigned</small>
        </div>
        <span className={room.status === 'ACTIVE' ? 'active' : ''}>
          {room.status.toLowerCase()}
        </span>
      </div>

      {room.assignments.length ? (
        <div className="breakout-assignment-chips">
          {room.assignments.map((assignment) => (
            <span key={assignment.id}>{assignment.user.displayName}</span>
          ))}
        </div>
      ) : null}

      {canManage ? (
        <div className="breakout-assignment-editor">
          <select
            multiple
            value={draftAssignments}
            onChange={(event) => {
              setDraftAssignments(
                Array.from(event.currentTarget.selectedOptions).map(
                  (option) => option.value,
                ),
              );
            }}
          >
            {members.map((membership) => (
              <option value={membership.user.id} key={membership.id}>
                {membership.user.displayName}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={assignmentPending}
            onClick={() => updateAssignments(draftAssignments)}
          >
            Save assignments
          </button>
        </div>
      ) : null}

      <button
        type="button"
        className="breakout-join-button"
        disabled={room.status !== 'ACTIVE'}
        onClick={onJoin}
      >
        {room.status === 'ACTIVE' ? 'Join breakout room' : 'Waiting for host'}
      </button>
    </article>
  );
}
