import { FormEvent, useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  DynamicPublicFormFields,
  dynamicAnswersComplete,
  type DynamicFieldDefinition,
} from './DynamicPublicFormFields';
import { publicApi } from './public-api';

interface WorkspaceBranding {
  workspaceName: string;
  logoUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  fontFamily: string | null;
  waitingRoomImageUrl: string | null;
}
interface PublicBookingPage {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  timezone: string;
  minimumNoticeMinutes: number;
  availabilityRules: Array<Record<string, unknown>>;
  intakeFields: DynamicFieldDefinition[];
  workspaceBranding: WorkspaceBranding | null;
}

interface Slot {
  startsAt: string;
  endsAt: string;
}

interface Reservation {
  id: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  status: 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';
  version: number;
  cancelledAt: string | null;
  rescheduledAt: string | null;
  session: { id: string; title: string } | null;
  managementToken: string;
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
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [managing, setManaging] = useState(false);
  const [rescheduleStartsAt, setRescheduleStartsAt] = useState('');

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

  const bookingBasePath = `/public/${encodeURIComponent(
    organizationSlug,
  )}/${encodeURIComponent(workspaceSlug)}/bookings/${encodeURIComponent(
    bookingSlug,
  )}`;

  const downloadCalendar = async () => {
    if (!reservation) return;
    setManaging(true);
    setError(null);
    try {
      const invite = await publicApi<{
        filename: string;
        contentType: string;
        content: string;
      }>(`${bookingBasePath}/reservations/${reservation.id}/calendar`, {
        method: 'POST',
        body: JSON.stringify({ managementToken: reservation.managementToken }),
      });
      const url = URL.createObjectURL(
        new Blob([invite.content], { type: invite.contentType }),
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = invite.filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Calendar invite could not be created');
    } finally {
      setManaging(false);
    }
  };

  const cancelReservation = async () => {
    if (!reservation) return;
    if (!window.confirm('Cancel this booking?')) return;
    setManaging(true);
    setError(null);
    try {
      const updated = await publicApi<Omit<Reservation, 'managementToken'>>(
        `${bookingBasePath}/reservations/${reservation.id}/cancel`,
        {
          method: 'POST',
          body: JSON.stringify({
            managementToken: reservation.managementToken,
            reason: 'Cancelled by attendee',
          }),
        },
      );
      setReservation({ ...updated, managementToken: reservation.managementToken });
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'The booking could not be cancelled');
    } finally {
      setManaging(false);
    }
  };

  const rescheduleReservation = async () => {
    if (!reservation || !rescheduleStartsAt) return;
    setManaging(true);
    setError(null);
    try {
      const updated = await publicApi<Omit<Reservation, 'managementToken'>>(
        `${bookingBasePath}/reservations/${reservation.id}/reschedule`,
        {
          method: 'POST',
          body: JSON.stringify({
            managementToken: reservation.managementToken,
            startsAt: rescheduleStartsAt,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        },
      );
      setReservation({ ...updated, managementToken: reservation.managementToken });
      setRescheduleStartsAt('');
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'The booking could not be rescheduled');
    } finally {
      setManaging(false);
    }
  };

  if (loading) return <PublicBookingState title="Loading availability…" />;
  if (error && !page) return <PublicBookingState title="Booking page unavailable" message={error} />;
  if (!page) return <PublicBookingState title="Booking page unavailable" />;

  const brand = page.workspaceBranding;
  const brandStyle = {
    '--workspace-primary': brand?.primaryColor ?? '#183f38',
    '--workspace-accent': brand?.accentColor ?? '#dcefe8',
    ...(brand?.fontFamily ? { fontFamily: brand.fontFamily } : {}),
  } as CSSProperties;

  return (
    <main className="public-flow-page booking-flow-page workspace-themed-public" style={brandStyle}>
      <header className="public-flow-nav">
        <a className="public-wordmark" href="/">
          <span>
            {brand?.logoUrl ? <img src={brand.logoUrl} alt="" /> : (brand?.workspaceName || 'Sessions').charAt(0).toUpperCase()}
          </span>
          {brand?.workspaceName || 'Sessions'}
        </a>
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
              <small>
                {reservation.status === 'CANCELLED'
                  ? 'This reservation has been cancelled.'
                  : reservation.rescheduledAt
                    ? 'Your meeting was rescheduled and the linked session was updated atomically.'
                    : 'The scheduled session and reservation were created atomically.'}
              </small>
              {reservation.status === 'CONFIRMED' ? (
                <div className="booking-management-actions">
                  <button type="button" onClick={downloadCalendar} disabled={managing}>
                    Download calendar invite
                  </button>
                  <label>
                    Move to another time
                    <select
                      value={rescheduleStartsAt}
                      onChange={(event) => setRescheduleStartsAt(event.target.value)}
                    >
                      <option value="">Choose another slot</option>
                      {slots
                        .filter((slot) => slot.startsAt !== reservation.startsAt)
                        .slice(0, 60)
                        .map((slot) => (
                          <option key={slot.startsAt} value={slot.startsAt}>
                            {new Intl.DateTimeFormat(undefined, {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            }).format(new Date(slot.startsAt))}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={rescheduleReservation}
                    disabled={managing || !rescheduleStartsAt}
                  >
                    Reschedule
                  </button>
                  <button
                    type="button"
                    className="danger-action"
                    onClick={cancelReservation}
                    disabled={managing}
                  >
                    Cancel booking
                  </button>
                </div>
              ) : null}
              {error ? <div className="public-error">{error}</div> : null}
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
                <DynamicPublicFormFields
                  fields={page.intakeFields}
                  answers={answers}
                  onChange={setAnswers}
                />
                {error ? <div className="public-error">{error}</div> : null}
                <button
                  disabled={
                    submitting ||
                    !selected ||
                    !name.trim() ||
                    !email.trim() ||
                    !dynamicAnswersComplete(page.intakeFields, answers)
                  }
                >
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
