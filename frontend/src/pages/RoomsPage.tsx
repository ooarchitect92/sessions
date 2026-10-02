import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateRoomInput, Room } from '@sessions/contracts';
import { FormEvent, useState } from 'react';
import { api } from '../api/client';

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

function setting(room: Room, key: string): boolean {
  return room.settings[key] === true;
}

export function RoomsPage() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [waitingRoom, setWaitingRoom] = useState(true);
  const [recordingDefault, setRecordingDefault] = useState(false);

  const rooms = useQuery({ queryKey: ['rooms'], queryFn: () => api.listRooms() });
  const create = useMutation({
    mutationFn: (input: CreateRoomInput) => api.createRoom(input),
    onSuccess: async () => {
      setTitle('');
      setSlug('');
      setSlugEdited(false);
      await queryClient.invalidateQueries({ queryKey: ['rooms'] });
    },
  });
  const remove = useMutation({
    mutationFn: (room: Room) => api.deleteRoom(room.id, room.version),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['rooms'] }),
  });

  const updateTitle = (value: string) => {
    setTitle(value);
    if (!slugEdited) setSlug(toSlug(value));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate({
      title,
      slug,
      settings: { waitingRoom, recordingDefault },
    });
  };

  return (
    <div className="rooms-page">
      <section className="page-heading rooms-heading">
        <div>
          <span className="eyebrow">Reusable meeting spaces</span>
          <h1>Rooms built for repeatable work.</h1>
          <p>Give recurring meetings a stable URL, default controls, and an agenda-ready home.</p>
        </div>
        <div className="feature-state-card">
          <span>Implemented vertical slice</span>
          <strong>Tenant-safe room CRUD</strong>
          <small>Branding, intro video, and host assignment follow in the room configuration increment.</small>
        </div>
      </section>

      <div className="rooms-layout">
        <section className="panel room-list-panel">
          <div className="panel-heading">
            <div><span className="eyebrow">Workspace inventory</span><h2>Permanent rooms</h2></div>
            <span className="count-pill">{rooms.data?.length ?? 0}</span>
          </div>

          {rooms.isLoading ? <div className="empty-panel">Loading rooms…</div> : null}
          {rooms.error ? <div className="error-banner">{rooms.error.message}</div> : null}
          {rooms.data?.length === 0 ? (
            <div className="empty-panel"><span>▦</span><h3>No permanent rooms yet</h3><p>Create one for sales demos, onboarding, office hours, or your team ritual.</p></div>
          ) : null}
          <div className="room-card-grid">
            {rooms.data?.map((room) => (
              <article className="room-card" key={room.id}>
                <div className="room-card-art"><span>{room.title.slice(0, 1).toUpperCase()}</span><small>/rooms/{room.slug}</small></div>
                <div className="room-card-body">
                  <div><span className="eyebrow">Permanent room</span><h3>{room.title}</h3></div>
                  <div className="room-flags">
                    <span className={setting(room, 'waitingRoom') ? 'enabled' : ''}>Waiting room</span>
                    <span className={setting(room, 'recordingDefault') ? 'enabled' : ''}>Recording default</span>
                  </div>
                  <div className="room-card-actions">
                    <button className="button secondary" type="button" disabled>Configure</button>
                    <button
                      className="text-danger-button"
                      type="button"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (window.confirm(`Delete ${room.title}?`)) remove.mutate(room);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <aside className="panel room-create-panel">
          <span className="eyebrow">Create a room</span>
          <h2>Set the defaults once.</h2>
          <p>Sessions created from this room can inherit its access and media preferences.</p>
          <form className="form-stack" onSubmit={submit}>
            <label>
              Room name
              <input required maxLength={160} value={title} onChange={(event) => updateTitle(event.target.value)} placeholder="Customer demos" />
            </label>
            <label>
              Stable URL slug
              <div className="slug-input"><span>/rooms/</span><input required minLength={2} maxLength={100} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={slug} onChange={(event) => { setSlugEdited(true); setSlug(toSlug(event.target.value)); }} /></div>
            </label>
            <label className="toggle-label compact-toggle">
              <input type="checkbox" checked={waitingRoom} onChange={(event) => setWaitingRoom(event.target.checked)} />
              <span><strong>Use a waiting room</strong><small>Hosts admit external participants.</small></span>
            </label>
            <label className="toggle-label compact-toggle">
              <input type="checkbox" checked={recordingDefault} onChange={(event) => setRecordingDefault(event.target.checked)} />
              <span><strong>Default recording on</strong><small>Consent must still be collected.</small></span>
            </label>
            {create.error ? <div className="error-banner">{create.error.message}</div> : null}
            <button className="button primary full-width" disabled={create.isPending || title.trim().length === 0 || slug.length < 2}>
              {create.isPending ? 'Creating room…' : 'Create permanent room'}
            </button>
          </form>
        </aside>
      </div>
    </div>
  );
}
