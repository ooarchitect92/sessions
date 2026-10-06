import { FormEvent, useEffect, useMemo, useState } from 'react';
import { publicApi } from './public-api';
import {
  PublicCustomFields,
  type PublicFormAnswers,
  type PublicFormField,
} from './PublicCustomFields';
import {
  PublicWordmark,
  publicBrandStyle,
  type PublicBranding,
} from './PublicBranding';

interface PublicBookingPage {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  timezone: string;
  minimumNoticeMinutes: number;
  availabilityRules: Array<Record<string, unknown>>;
  intakeFields: PublicFormField[];
  branding: PublicBranding;
}

interface Slot {
  startsAt: string;
  endsAt: string;
}

interface Reservation {
  id: string;
  startsAt: string;
  endsAt: string;
  status: 'CONFIRMED';
  session: { id: string; title: string } | null;
  manageToken: string;
}

function calendarDate(value: Date): string {
  return `${value.getFullYear().toString().padStart(4, '0')}-${(value.getMonth() + 1)
    .toString()
    .padStart(2, '0')}-${value.getDate().toString().padStart(2, '0')}`;
}

export function PublicBookingPage({
  organizationSlug,
  workspaceSlug,
  bookingSlug,
}: {
  organizationSlug: string;
  workspaceSlug: string;
  bookingSlug: string;
}) {
  const dateRange = useMemo(() => {
    const start = new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + 14);
    return { dateFrom: calendarDate(start), dateTo: calendarDate(end) };
  }, []);
  const [page, setPage] = useState<PublicBookingPage | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selected, setSelected] = useState<Slot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [answers, setAnswers] = useState<PublicFormAnswers>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const basePath = `/public/${encodeURIComponent(organizationSlug)}/${encodeURIComponent(
      workspaceSlug,
    )}/bookings/${encodeURIComponent(bookingSlug)}`;
    Promise.all([
      publicApi<PublicBookingPage>(basePath),
      publicApi<Slot[]>(
        `${basePath}/slots?dateFrom=${encodeURIComponent(
          dateRange.dateFrom,
        )}&dateTo=${encodeURIComponent(dateRange.dateTo)}`,
      ),
    ])
      .then(([nextPage, nextSlots]) => {
        if (!cancelled) {
          setPage(nextPage);
          setSlots(nextSlots);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'The booking page could not be loaded');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bookingSlug, dateRange, organizationSlug, workspaceSlug]);

  const submit = async (formEvent: FormEvent) => {
    formEvent.preventDefault();
    if (!selected || !page) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await publicApi<Reservation>(
        `/public/${encodeURIComponent(organizationSlug)}/${encodeURIComponent(
          workspaceSlug,
        )}/bookings/${encodeURIComponent(bookingSlug)}/reservations`,
        {
          method: 'POST',
          body: JSON.stringify({
            name,
            email,
            startsAt: selected.startsAt,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            answers,
          }),
        },
      );
      setReservation(result);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'The time could not be reserved');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <PublicBookingState title="Loading availability…" />;
  if (error && !page) return <PublicBookingState title="Booking page unavailable" message={error} />;
  if (!page) return <PublicBookingState title="Booking page unavailable" />;

  return (
    <main
      className="public-flow-page booking-flow-page"
      style={publicBrandStyle(page.branding)}
    >
      <header className="public-flow-nav">
        <PublicWordmark branding={page.branding} />
        <span className="public-live-label">Secure scheduling</span>
      </header>

      <div className="public-booking-shell">
        <section className="booking-intro">
          <span className="public-kicker">Book a session</span>
          <h1>{page.title}</h1>
          <p>
            {page.description ??
              `Choose an available ${page.durationMinutes}-minute time. The booking creates a scheduled meeting without exposing the host's private calendar.`}
          </p>
          <div className="booking-facts">
            <span>◷ {page.durationMinutes} minutes</span>
            <span>⌁ {page.timezone}</span>
            <span>↗ {page.minimumNoticeMinutes} minute minimum notice</span>
          </div>
        </section>

        {reservation ? (
          <section className="public-action-card booking-success-card">
            <div className="public-success-state">
              <span>✓</span>
              <h2>Your meeting is scheduled.</h2>
              <p>
                {new Intl.DateTimeFormat(undefined, {
                  dateStyle: 'full',
                  timeStyle: 'short',
                }).format(new Date(reservation.startsAt))}
              </p>
              <small>The scheduled session and reservation were created atomically.</small>
              <a
                className="public-secondary-link"
                href={`/book/${encodeURIComponent(organizationSlug)}/${encodeURIComponent(
                  workspaceSlug,
                )}/${encodeURIComponent(bookingSlug)}/manage/${encodeURIComponent(
                  reservation.id,
                )}?token=${encodeURIComponent(reservation.manageToken)}`}
              >
                Manage or reschedule booking
              </a>
            </div>
          </section>
        ) : (
          <div className="public-booking-grid">
            <section className="slot-panel">
              <div className="slot-panel-heading">
                <div>
                  <span className="public-kicker">Available times</span>
                  <h2>Next 14 days</h2>
                </div>
                <span>{slots.length} slots</span>
              </div>
              {slots.length === 0 ? (
                <div className="no-slots">No open times were found in this period.</div>
              ) : (
                <div className="slot-grid">
                  {slots.slice(0, 60).map((slot) => {
                    const active = selected?.startsAt === slot.startsAt;
                    return (
                      <button
                        className={active ? 'selected' : ''}
                        key={slot.startsAt}
                        onClick={() => setSelected(slot)}
                      >
                        <strong>
                          {new Intl.DateTimeFormat(undefined, {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                          }).format(new Date(slot.startsAt))}
                        </strong>
                        <span>
                          {new Intl.DateTimeFormat(undefined, {
                            hour: 'numeric',
                            minute: '2-digit',
                          }).format(new Date(slot.startsAt))}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <aside className="public-action-card">
              <span className="public-kicker">Your details</span>
              <h2>{selected ? 'Confirm this time' : 'Select an available time'}</h2>
              {selected ? (
                <div className="selected-slot-summary">
                  {new Intl.DateTimeFormat(undefined, {
                    dateStyle: 'full',
                    timeStyle: 'short',
                  }).format(new Date(selected.startsAt))}
                </div>
              ) : null}
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
                <PublicCustomFields
                  fields={page.intakeFields}
                  answers={answers}
                  onChange={(key, value) =>
                    setAnswers((current) => ({ ...current, [key]: value }))
                  }
                />
                {error ? <div className="public-error">{error}</div> : null}
                <button disabled={submitting || !selected || !name.trim() || !email.trim()}>
                  {submitting ? 'Scheduling…' : 'Schedule meeting'}
                </button>
              </form>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}

function PublicBookingState({ title, message }: { title: string; message?: string }) {
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
