import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import {
  api,
  type EventPresenterRecord,
  type EventPresenterRole,
} from '../api/client';

const ADDABLE_ROLES: Array<{
  value: Exclude<EventPresenterRole, 'ORGANIZER'>;
  label: string;
}> = [
  { value: 'HOST', label: 'Host' },
  { value: 'CO_HOST', label: 'Co-host' },
  { value: 'SPEAKER', label: 'Speaker' },
];

function roleLabel(role: EventPresenterRole): string {
  return role === 'CO_HOST'
    ? 'Co-host'
    : role.charAt(0) + role.slice(1).toLowerCase();
}

export function EventPresenterManager({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('');
  const [role, setRole] =
    useState<Exclude<EventPresenterRole, 'ORGANIZER'>>('SPEAKER');

  const presenters = useQuery({
    queryKey: ['event-presenters', eventId],
    queryFn: () => api.listEventPresenters(eventId),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['event-presenters', eventId] });

  const create = useMutation({
    mutationFn: () =>
      api.createEventPresenter(eventId, {
        role,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        ...(title.trim() ? { title: title.trim() } : {}),
        isPublic: true,
      }),
    onSuccess: async () => {
      setName('');
      setEmail('');
      setTitle('');
      setRole('SPEAKER');
      await invalidate();
    },
  });

  const update = useMutation({
    mutationFn: ({
      presenter,
      patch,
    }: {
      presenter: EventPresenterRecord;
      patch: { role?: EventPresenterRole; isPublic?: boolean };
    }) => api.updateEventPresenter(eventId, presenter.id, patch),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (presenterId: string) =>
      api.removeEventPresenter(eventId, presenterId),
    onSuccess: invalidate,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !email.trim()) return;
    create.mutate();
  };

  return (
    <div className="presenter-manager">
      <div className="presenter-manager-heading">
        <div>
          <strong>Presenter team</strong>
          <small>
            Organizer, hosts and co-hosts can moderate the room. Speakers can publish
            media without room-admin privileges.
          </small>
        </div>
        <span>{presenters.data?.length ?? 0}</span>
      </div>

      {presenters.isLoading ? (
        <div className="dynamic-form-empty">Loading presenters…</div>
      ) : null}
      {presenters.error ? (
        <div className="error-banner">{presenters.error.message}</div>
      ) : null}

      <div className="presenter-list">
        {presenters.data?.map((presenter) => (
          <article className="presenter-row" key={presenter.id}>
            <div>
              <strong>{presenter.name}</strong>
              <span>
                {roleLabel(presenter.role)}
                {presenter.title ? ' · ' + presenter.title : ''}
              </span>
              <small>{presenter.email}</small>
            </div>
            <div className="presenter-row-actions">
              {presenter.role !== 'ORGANIZER' ? (
                <select
                  value={presenter.role}
                  disabled={update.isPending}
                  onChange={(event) =>
                    update.mutate({
                      presenter,
                      patch: { role: event.target.value as EventPresenterRole },
                    })
                  }
                >
                  {ADDABLE_ROLES.map((item) => (
                    <option value={item.value} key={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="state-chip enabled">Protected organizer</span>
              )}
              <label className="presenter-public-toggle">
                <input
                  type="checkbox"
                  checked={presenter.isPublic}
                  disabled={update.isPending}
                  onChange={(event) =>
                    update.mutate({
                      presenter,
                      patch: { isPublic: event.target.checked },
                    })
                  }
                />
                Public
              </label>
              {presenter.role !== 'ORGANIZER' ? (
                <button
                  type="button"
                  className="settings-row-action danger-text"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        'Remove ' + presenter.name + ' from this event?',
                      )
                    ) {
                      remove.mutate(presenter.id);
                    }
                  }}
                >
                  Remove
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      <form className="presenter-add-form" onSubmit={submit}>
        <div className="form-grid">
          <label>
            Presenter name
            <input
              value={name}
              maxLength={160}
              required
              onChange={(event) => setName(event.target.value)}
              placeholder="Jordan Lee"
            />
          </label>
          <label>
            Email
            <input
              value={email}
              type="email"
              required
              onChange={(event) => setEmail(event.target.value)}
              placeholder="jordan@example.com"
            />
          </label>
        </div>
        <div className="form-grid">
          <label>
            Stage role
            <select
              value={role}
              onChange={(event) =>
                setRole(
                  event.target.value as Exclude<
                    EventPresenterRole,
                    'ORGANIZER'
                  >,
                )
              }
            >
              {ADDABLE_ROLES.map((item) => (
                <option value={item.value} key={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Public title
            <input
              value={title}
              maxLength={160}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="VP, Customer Success"
            />
          </label>
        </div>
        <button
          className="button secondary full-width"
          disabled={create.isPending || !name.trim() || !email.trim()}
        >
          {create.isPending ? 'Adding…' : 'Add presenter'}
        </button>
      </form>

      {create.error ? (
        <div className="error-banner">{create.error.message}</div>
      ) : null}
      {update.error ? (
        <div className="error-banner">{update.error.message}</div>
      ) : null}
      {remove.error ? (
        <div className="error-banner">{remove.error.message}</div>
      ) : null}
    </div>
  );
}
