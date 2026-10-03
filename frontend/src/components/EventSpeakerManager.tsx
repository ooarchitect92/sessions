import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import {
  api,
  type EventRecord,
  type EventSpeakerRecord,
  type EventStageRole,
} from '../api/client';

const roles: EventStageRole[] = ['ORGANIZER', 'HOST', 'COHOST', 'SPEAKER'];

export function EventSpeakerManager({ event }: { event: EventRecord }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('');
  const [bio, setBio] = useState('');
  const [role, setRole] = useState<EventStageRole>('SPEAKER');
  const members = useQuery({
    queryKey: ['workspace-members'],
    queryFn: () => api.listWorkspaceMembers(),
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['events'] });
  };

  const createSpeaker = useMutation({
    mutationFn: () =>
      api.createEventSpeaker(event.id, {
        role,
        displayName,
        ...(userId ? { userId } : {}),
        ...(email.trim() ? { email: email.trim() } : {}),
        ...(title.trim() ? { title: title.trim() } : {}),
        ...(bio.trim() ? { bio: bio.trim() } : {}),
      }),
    onSuccess: async () => {
      setUserId('');
      setDisplayName('');
      setEmail('');
      setTitle('');
      setBio('');
      setRole('SPEAKER');
      await refresh();
    },
  });

  const updateRole = useMutation({
    mutationFn: ({
      speaker,
      role: nextRole,
    }: {
      speaker: EventSpeakerRecord;
      role: EventStageRole;
    }) => api.updateEventSpeaker(event.id, speaker.id, { role: nextRole }),
    onSuccess: refresh,
  });

  const removeSpeaker = useMutation({
    mutationFn: (speakerId: string) =>
      api.deleteEventSpeaker(event.id, speakerId),
    onSuccess: refresh,
  });

  const submit = (formEvent: FormEvent) => {
    formEvent.preventDefault();
    createSpeaker.mutate();
  };

  const speakers = event.speakers ?? [];

  return (
    <div className="event-speaker-manager">
      <button
        type="button"
        className="text-button"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? 'Hide stage team' : 'Stage team · ' + speakers.length}
      </button>

      {open ? (
        <div className="event-speaker-panel">
          <div className="event-speaker-list">
            {speakers.length === 0 ? (
              <div className="artifact-placeholder compact-placeholder">
                No stage profiles yet. Publishing will automatically retain the
                organizer as a stage member.
              </div>
            ) : null}
            {speakers.map((speaker) => (
              <article className="event-speaker-row" key={speaker.id}>
                <div className="event-speaker-avatar" aria-hidden="true">
                  {speaker.displayName
                    .split(/\\s+/)
                    .slice(0, 2)
                    .map((part) => part[0]?.toUpperCase() ?? '')
                    .join('')}
                </div>
                <div className="event-speaker-copy">
                  <strong>{speaker.displayName}</strong>
                  <span>{speaker.title || speaker.email || 'Stage participant'}</span>
                </div>
                <select
                  aria-label={'Role for ' + speaker.displayName}
                  value={speaker.role}
                  disabled={updateRole.isPending}
                  onChange={(inputEvent) =>
                    updateRole.mutate({
                      speaker,
                      role: inputEvent.target.value as EventStageRole,
                    })
                  }
                >
                  {roles.map((value) => (
                    <option value={value} key={value}>
                      {value.toLowerCase().replace('cohost', 'co-host')}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="icon-button danger-text"
                  aria-label={'Remove ' + speaker.displayName}
                  disabled={removeSpeaker.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        'Remove ' + speaker.displayName + ' from the stage team?',
                      )
                    ) {
                      removeSpeaker.mutate(speaker.id);
                    }
                  }}
                >
                  ×
                </button>
              </article>
            ))}
          </div>

          {!['ENDED', 'CANCELLED'].includes(event.status) ? (
            <form className="event-speaker-form" onSubmit={submit}>
              <label>
                Workspace user for stage permissions
                <select
                  value={userId}
                  onChange={(inputEvent) => {
                    const nextUserId = inputEvent.target.value;
                    setUserId(nextUserId);
                    const member = members.data?.find(
                      (entry) => entry.user.id === nextUserId,
                    );
                    if (member) {
                      setDisplayName(member.user.displayName);
                      setEmail(member.user.email);
                    }
                  }}
                >
                  <option value="">External / profile only</option>
                  {members.data?.map((member) => (
                    <option value={member.user.id} key={member.id}>
                      {member.user.displayName} · {member.user.email}
                    </option>
                  ))}
                </select>
                <small>
                  Linking a workspace user lets the media gateway enforce speaker,
                  host, or co-host publishing permissions.
                </small>
              </label>

              <div className="form-grid">
                <label>
                  Display name
                  <input
                    required
                    maxLength={160}
                    value={displayName}
                    onChange={(inputEvent) => setDisplayName(inputEvent.target.value)}
                    placeholder="Avery Chen"
                  />
                </label>
                <label>
                  Stage role
                  <select
                    value={role}
                    onChange={(inputEvent) =>
                      setRole(inputEvent.target.value as EventStageRole)
                    }
                  >
                    {roles.map((value) => (
                      <option value={value} key={value}>
                        {value.toLowerCase().replace('cohost', 'co-host')}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="form-grid">
                <label>
                  Email
                  <input
                    type="email"
                    value={email}
                    onChange={(inputEvent) => setEmail(inputEvent.target.value)}
                    placeholder="avery@example.com"
                  />
                </label>
                <label>
                  Title
                  <input
                    maxLength={160}
                    value={title}
                    onChange={(inputEvent) => setTitle(inputEvent.target.value)}
                    placeholder="VP, Customer Success"
                  />
                </label>
              </div>
              <label>
                Bio
                <textarea
                  rows={3}
                  maxLength={4000}
                  value={bio}
                  onChange={(inputEvent) => setBio(inputEvent.target.value)}
                  placeholder="Short public speaker biography"
                />
              </label>
              {createSpeaker.error ? (
                <div className="error-banner">{createSpeaker.error.message}</div>
              ) : null}
              {updateRole.error ? (
                <div className="error-banner">{updateRole.error.message}</div>
              ) : null}
              {removeSpeaker.error ? (
                <div className="error-banner">{removeSpeaker.error.message}</div>
              ) : null}
              <button
                type="submit"
                className="button secondary"
                disabled={createSpeaker.isPending || !displayName.trim()}
              >
                {createSpeaker.isPending ? 'Adding…' : 'Add stage profile'}
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
