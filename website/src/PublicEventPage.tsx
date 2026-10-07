import { FormEvent, useEffect, useState } from 'react';
import {
  DynamicPublicFormFields,
  dynamicAnswersComplete,
  type DynamicFieldDefinition,
} from './DynamicPublicFormFields';
import { publicApi } from './public-api';

interface PublicEvent {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  startsAt: string;
  durationMinutes: number;
  timezone: string;
  capacity: number | null;
  registrationFields: DynamicFieldDefinition[];
  branding: Record<string, unknown>;
  status: 'PUBLISHED' | 'LIVE';
  registrationCount: number;
  presenters: Array<{
    id: string;
    role: 'ORGANIZER' | 'HOST' | 'CO_HOST' | 'SPEAKER';
    name: string;
    title: string | null;
    bio: string | null;
    avatarUrl: string | null;
    position: number;
  }>;
}

interface Registration {
  id: string;
  status: 'REGISTERED' | 'WAITLISTED';
}

export function PublicEventPage({
  organizationSlug,
  workspaceSlug,
  eventSlug,
}: {
  organizationSlug: string;
  workspaceSlug: string;
  eventSlug: string;
}) {
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [registration, setRegistration] = useState<Registration | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    publicApi<PublicEvent>(
      `/public/${encodeURIComponent(organizationSlug)}/${encodeURIComponent(
        workspaceSlug,
      )}/events/${encodeURIComponent(eventSlug)}`,
    )
      .then((value) => {
        if (!cancelled) setEvent(value);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'The event could not be loaded');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eventSlug, organizationSlug, workspaceSlug]);

  const submit = async (formEvent: FormEvent) => {
    formEvent.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await publicApi<Registration>(
        `/public/${encodeURIComponent(organizationSlug)}/${encodeURIComponent(
          workspaceSlug,
        )}/events/${encodeURIComponent(eventSlug)}/registrations`,
        {
          method: 'POST',
          body: JSON.stringify({ name, email, answers }),
        },
      );
      setRegistration(result);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <PublicState title="Loading event…" />;
  if (error && !event) return <PublicState title="Event unavailable" message={error} />;
  if (!event) return <PublicState title="Event unavailable" />;

  const remaining =
    event.capacity === null ? null : Math.max(0, event.capacity - event.registrationCount);

  return (
    <main className="public-flow-page event-flow-page">
      <header className="public-flow-nav">
        <a className="public-wordmark" href="/">
          <span>S</span>
          Sessions
        </a>
        <span className="public-live-label">{event.status === 'LIVE' ? 'Live now' : 'Registration open'}</span>
      </header>

      <div className="public-event-layout">
        <section className="public-event-story">
          <span className="public-kicker">Interactive event</span>
          <h1>{event.title}</h1>
          <p className="public-event-description">
            {event.description ?? 'Join a focused, interactive webinar with a shared agenda, live questions, and collaborative participation.'}
          </p>
          {event.presenters.length ? (
            <section className="public-presenter-section">
              <span className="public-kicker">Presenter team</span>
              <div className="public-presenter-grid">
                {event.presenters.map((presenter) => (
                  <article key={presenter.id}>
                    {presenter.avatarUrl ? (
                      <img src={presenter.avatarUrl} alt="" />
                    ) : (
                      <span className="public-presenter-avatar">
                        {presenter.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <div>
                      <strong>{presenter.name}</strong>
                      <small>
                        {presenter.title ??
                          (presenter.role === 'CO_HOST'
                            ? 'Co-host'
                            : presenter.role.charAt(0) +
                              presenter.role.slice(1).toLowerCase())}
                      </small>
                      {presenter.bio ? <p>{presenter.bio}</p> : null}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
          <div className="public-event-facts">
            <article>
              <span>Date and time</span>
              <strong>
                {new Intl.DateTimeFormat(undefined, {
                  dateStyle: 'full',
                  timeStyle: 'short',
                }).format(new Date(event.startsAt))}
              </strong>
              <small>{event.timezone}</small>
            </article>
            <article>
              <span>Duration</span>
              <strong>{event.durationMinutes} minutes</strong>
              <small>Agenda-led experience</small>
            </article>
            <article>
              <span>Availability</span>
              <strong>
                {remaining === null
                  ? 'Open capacity'
                  : remaining > 0
                    ? `${remaining} places left`
                    : 'Waitlist available'}
              </strong>
              <small>{event.registrationCount} people registered</small>
            </article>
          </div>
        </section>

        <aside className="public-action-card">
          {registration ? (
            <div className="public-success-state">
              <span>✓</span>
              <h2>
                {registration.status === 'WAITLISTED'
                  ? 'You are on the waitlist.'
                  : 'Your place is reserved.'}
              </h2>
              <p>
                The registration has been stored. Reminder delivery and calendar attachment
                generation are handled by the notification workflow when configured.
              </p>
            </div>
          ) : (
            <>
              <span className="public-kicker">Reserve your place</span>
              <h2>Register for this event</h2>
              <p>Use an email address where the organizer can send joining information.</p>
              <form className="public-form" onSubmit={submit}>
                <label>
                  Full name
                  <input
                    required
                    maxLength={160}
                    value={name}
                    onChange={(inputEvent) => setName(inputEvent.target.value)}
                    autoComplete="name"
                  />
                </label>
                <label>
                  Email address
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(inputEvent) => setEmail(inputEvent.target.value)}
                    autoComplete="email"
                  />
                </label>
                <DynamicPublicFormFields
                  fields={event.registrationFields}
                  answers={answers}
                  onChange={setAnswers}
                />
                {error ? <div className="public-error">{error}</div> : null}
                <button
                  disabled={
                    submitting ||
                    !name.trim() ||
                    !email.trim() ||
                    !dynamicAnswersComplete(event.registrationFields, answers)
                  }
                >
                  {submitting ? 'Registering…' : 'Register now'}
                </button>
              </form>
            </>
          )}
        </aside>
      </div>
    </main>
  );
}

function PublicState({ title, message }: { title: string; message?: string }) {
  return (
    <main className="public-state-page">
      <a className="public-wordmark" href="/">
        <span>S</span>
        Sessions
      </a>
      <h1>{title}</h1>
      {message ? <p>{message}</p> : null}
      <a className="public-secondary-link" href="/">
        Return home
      </a>
    </main>
  );
}
