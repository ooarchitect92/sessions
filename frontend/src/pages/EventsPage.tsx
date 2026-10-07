import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateEventInput,
  EventPresenter,
  EventPresenterRole,
  PublicFormField,
} from '@sessions/contracts';
import { FormEvent, useMemo, useState } from 'react';
import { api, type EventRecord } from '../api/client';

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function EventsPage() {
  const queryClient = useQueryClient();
  const defaultStart = useMemo(() => {
    const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    date.setMinutes(0, 0, 0);
    return date.toISOString().slice(0, 16);
  }, []);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [startsAt, setStartsAt] = useState(defaultStart);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [capacity, setCapacity] = useState('250');
  const [registrationFields, setRegistrationFields] = useState<PublicFormField[]>([]);

  const events = useQuery({ queryKey: ['events'], queryFn: () => api.listEvents() });
  const create = useMutation({
    mutationFn: (input: CreateEventInput) => api.createEvent(input),
    onSuccess: async () => {
      setTitle('');
      setSlug('');
      setSlugEdited(false);
      setRegistrationFields([]);
      await queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
  const publish = useMutation({
    mutationFn: (event: EventRecord) => api.publishEvent(event.id, event.version),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['events'] }),
  });
  const cancel = useMutation({
    mutationFn: (event: EventRecord) => api.cancelEvent(event.id, event.version),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['events'] }),
  });

  const updateTitle = (value: string) => {
    setTitle(value);
    if (!slugEdited) setSlug(toSlug(value));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate({
      slug,
      title,
      startsAt: new Date(startsAt).toISOString(),
      durationMinutes,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      capacity: capacity.trim() ? Number(capacity) : null,
      registrationFields,
      branding: {},
    });
  };

  return (
    <div className="workflow-page">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Audience workflows</span>
          <h1>Publish webinars people want to attend.</h1>
          <p>
            Build a public event, control capacity and waitlisting, collect registrations,
            and create the underlying webinar session only when the event is published.
          </p>
        </div>
        <div className="feature-state-card">
          <span>Implemented vertical slice</span>
          <strong>Event → registration → webinar</strong>
          <small>Reminder delivery, speaker profiles, and the visual landing-page builder remain separate increments.</small>
        </div>
      </section>

      <div className="workflow-layout">
        <section className="panel workflow-list-panel">
          <div className="panel-heading">
            <div><span className="eyebrow">Workspace events</span><h2>Webinars and events</h2></div>
            <span className="count-pill">{events.data?.length ?? 0}</span>
          </div>
          {events.isLoading ? <div className="empty-panel">Loading events…</div> : null}
          {events.error ? <div className="error-banner">{events.error.message}</div> : null}
          {events.data?.length === 0 ? (
            <div className="empty-panel"><span>◉</span><h3>No events yet</h3><p>Create a draft, review it, and publish when registration should open.</p></div>
          ) : null}
          <div className="workflow-card-list">
            {events.data?.map((event) => (
              <article className="workflow-card" key={event.id}>
                <div className="workflow-card-main">
                  <div className="workflow-card-title">
                    <span className={`status-badge status-${event.status.toLowerCase()}`}>{event.status.toLowerCase()}</span>
                    <h3>{event.title}</h3>
                  </div>
                  <p>{formatDate(event.startsAt)} · {event.durationMinutes} min · {event.timezone}</p>
                  <div className="workflow-meta">
                    <span>{event._count?.registrations ?? 0} registrations</span>
                    <span>{event.capacity ? `${event.capacity} capacity` : 'Unlimited capacity'}</span>
                    <span>/{event.slug}</span>
                  </div>
                </div>
                <div className="workflow-actions">
                  {event.status === 'DRAFT' ? (
                    <button className="button primary" onClick={() => publish.mutate(event)} disabled={publish.isPending}>Publish</button>
                  ) : null}
                  {!['ENDED', 'CANCELLED'].includes(event.status) ? (
                    <button className="button secondary" onClick={() => cancel.mutate(event)} disabled={cancel.isPending}>Cancel</button>
                  ) : null}
                </div>
                <EventPresenterManager eventId={event.id} />
              </article>
            ))}
          </div>
        </section>

        <aside className="panel workflow-create-panel">
          <span className="eyebrow">Create event</span>
          <h2>Start as a controlled draft.</h2>
          <p>Publishing creates a scheduled webinar session and opens the public registration endpoint.</p>
          <form className="form-stack" onSubmit={submit}>
            <label>
              Event title
              <input required maxLength={160} value={title} onChange={(event) => updateTitle(event.target.value)} placeholder="Modern finance leadership summit" />
            </label>
            <label>
              Public slug
              <input required minLength={2} maxLength={100} value={slug} onChange={(event) => { setSlugEdited(true); setSlug(toSlug(event.target.value)); }} placeholder="finance-summit" />
            </label>
            <div className="custom-field-builder">
              <div className="custom-field-builder-heading">
                <div>
                  <strong>Registration form</strong>
                  <small>Ask attendee questions or collect consent.</small>
                </div>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() =>
                    setRegistrationFields((fields) => [
                      ...fields,
                      {
                        key: `question_${fields.length + 1}`,
                        label: 'New question',
                        type: 'TEXT',
                        required: false,
                        options: [],
                      },
                    ])
                  }
                >
                  Add field
                </button>
              </div>
              {registrationFields.map((field, index) => (
                <div className="custom-field-row" key={`${field.key}-${index}`}>
                  <input
                    aria-label="Field label"
                    maxLength={160}
                    value={field.label}
                    onChange={(event) =>
                      setRegistrationFields((fields) =>
                        fields.map((candidate, candidateIndex) =>
                          candidateIndex === index
                            ? {
                                ...candidate,
                                label: event.target.value,
                                key: `field_${index + 1}_${toSlug(event.target.value)
                                  .replace(/-/g, '_')
                                  .slice(0, 60) || 'question'}`,
                              }
                            : candidate,
                        ),
                      )
                    }
                  />
                  <select
                    aria-label="Field type"
                    value={field.type}
                    onChange={(event) =>
                      setRegistrationFields((fields) =>
                        fields.map((candidate, candidateIndex) =>
                          candidateIndex === index
                            ? {
                                ...candidate,
                                type: event.target.value as PublicFormField['type'],
                                options:
                                  event.target.value === 'SELECT'
                                    ? candidate.options.length
                                      ? candidate.options
                                      : ['Option 1', 'Option 2']
                                    : [],
                              }
                            : candidate,
                        ),
                      )
                    }
                  >
                    <option value="TEXT">Short text</option>
                    <option value="TEXTAREA">Long text</option>
                    <option value="SELECT">Dropdown</option>
                    <option value="CHECKBOX">Checkbox</option>
                    <option value="CONSENT">Consent</option>
                  </select>
                  <label className="inline-checkbox">
                    <input
                      checked={field.required}
                      type="checkbox"
                      onChange={(event) =>
                        setRegistrationFields((fields) =>
                          fields.map((candidate, candidateIndex) =>
                            candidateIndex === index
                              ? { ...candidate, required: event.target.checked }
                              : candidate,
                          ),
                        )
                      }
                    />
                    Required
                  </label>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() =>
                      setRegistrationFields((fields) =>
                        fields.filter((_, candidateIndex) => candidateIndex !== index),
                      )
                    }
                  >
                    Remove
                  </button>
                  {field.type === 'SELECT' ? (
                    <input
                      className="custom-field-options"
                      aria-label="Dropdown options"
                      value={field.options.join(', ')}
                      onChange={(event) =>
                        setRegistrationFields((fields) =>
                          fields.map((candidate, candidateIndex) =>
                            candidateIndex === index
                              ? {
                                  ...candidate,
                                  options: event.target.value
                                    .split(',')
                                    .map((option) => option.trim())
                                    .filter(Boolean),
                                }
                              : candidate,
                          ),
                        )
                      }
                      placeholder="Option 1, Option 2"
                    />
                  ) : null}
                </div>
              ))}
            </div>
            <label>
              Starts at
              <input required type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
            </label>
            <div className="form-grid">
              <label>
                Duration
                <select value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))}>
                  <option value={30}>30 minutes</option>
                  <option value={60}>60 minutes</option>
                  <option value={90}>90 minutes</option>
                  <option value={120}>2 hours</option>
                </select>
              </label>
              <label>
                Capacity
                <input type="number" min={1} max={100000} value={capacity} onChange={(event) => setCapacity(event.target.value)} />
              </label>
            </div>
            {create.error ? <div className="error-banner">{create.error.message}</div> : null}
            <button className="button primary full-width" disabled={create.isPending || !title.trim() || slug.length < 2}>
              {create.isPending ? 'Creating…' : 'Create event draft'}
            </button>
          </form>
        </aside>
      </div>
    </div>
  );

function EventPresenterManager({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [role, setRole] = useState<Exclude<EventPresenterRole, 'ORGANIZER'>>('SPEAKER');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('');
  const presenters = useQuery({
    queryKey: ['event-presenters', eventId],
    queryFn: () => api.listEventPresenters(eventId),
    enabled: expanded,
  });

  const create = useMutation({
    mutationFn: () =>
      api.createEventPresenter(eventId, {
        role,
        name,
        email,
        ...(title.trim() ? { title: title.trim() } : {}),
      }),
    onSuccess: async () => {
      setName('');
      setEmail('');
      setTitle('');
      await queryClient.invalidateQueries({ queryKey: ['event-presenters', eventId] });
    },
  });

  const updateRole = useMutation({
    mutationFn: (input: {
      presenterId: string;
      role: Exclude<EventPresenterRole, 'ORGANIZER'>;
    }) => api.updateEventPresenter(eventId, input.presenterId, { role: input.role }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['event-presenters', eventId] });
    },
  });

  const remove = useMutation({
    mutationFn: (presenterId: string) => api.deleteEventPresenter(eventId, presenterId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['event-presenters', eventId] });
    },
  });

  return (
    <div className="event-presenter-manager">
      <button
        className="button secondary"
        type="button"
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? 'Hide presenter team' : 'Manage presenter team'}
      </button>
      {expanded ? (
        <div className="event-presenter-panel">
          <div className="event-presenter-list">
            {presenters.isLoading ? <span>Loading presenter team…</span> : null}
            {presenters.data?.map((presenter: EventPresenter) => (
              <div className="event-presenter-row" key={presenter.id}>
                <div>
                  <strong>{presenter.name}</strong>
                  <span>
                    {presenter.title || presenter.email} ·{' '}
                    {presenter.role.toLowerCase().replace('_', '-')}
                  </span>
                </div>
                {presenter.role !== 'ORGANIZER' ? (
                  <div className="event-presenter-actions">
                    <select
                      value={presenter.role}
                      onChange={(event) =>
                        updateRole.mutate({
                          presenterId: presenter.id,
                          role: event.target.value as Exclude<
                            EventPresenterRole,
                            'ORGANIZER'
                          >,
                        })
                      }
                    >
                      <option value="HOST">Host</option>
                      <option value="CO_HOST">Co-host</option>
                      <option value="SPEAKER">Speaker</option>
                    </select>
                    <button
                      className="button secondary"
                      type="button"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (window.confirm(`Remove ${presenter.name} from the event team?`)) {
                          remove.mutate(presenter.id);
                        }
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <span className="status-badge">organizer</span>
                )}
              </div>
            ))}
          </div>

          <form
            className="event-presenter-form"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate();
            }}
          >
            <select
              aria-label="Presenter role"
              value={role}
              onChange={(event) =>
                setRole(
                  event.target.value as Exclude<EventPresenterRole, 'ORGANIZER'>,
                )
              }
            >
              <option value="HOST">Host</option>
              <option value="CO_HOST">Co-host</option>
              <option value="SPEAKER">Speaker</option>
            </select>
            <input
              required
              maxLength={160}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Presenter name"
            />
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="presenter@example.com"
            />
            <input
              maxLength={160}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Title / company (optional)"
            />
            <button
              className="button primary"
              disabled={create.isPending || !name.trim() || !email.trim()}
            >
              {create.isPending ? 'Adding…' : 'Add presenter'}
            </button>
          </form>
          {presenters.error ? <div className="error-banner">{presenters.error.message}</div> : null}
          {create.error ? <div className="error-banner">{create.error.message}</div> : null}
          {updateRole.error ? (
            <div className="error-banner">{updateRole.error.message}</div>
          ) : null}
          {remove.error ? <div className="error-banner">{remove.error.message}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
}
