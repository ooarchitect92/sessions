import { FormEvent, useEffect, useMemo, useState } from 'react';
import { publicApi } from './public-api';

type IntakeFieldType =
  | 'TEXT'
  | 'TEXTAREA'
  | 'EMAIL'
  | 'SELECT'
  | 'CHECKBOX'
  | 'CONSENT';

interface IntakeField {
  key: string;
  label: string;
  type: IntakeFieldType;
  required: boolean;
  placeholder?: string;
  options?: string[];
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
  intakeFields: IntakeField[];
}

interface Slot {
  startsAt: string;
  endsAt: string;
}

interface Reservation {
  id: string;
  startsAt: string;
  endsAt: string;
  status: 'CONFIRMED' | 'CANCELLED';
  cancelledAt: string | null;
  rescheduleCount: number;
  version: number;
  managementToken: string;
  session: { id: string; title: string; status: string } | null;
}

interface CalendarFile {
  filename: string;
  contentType: string;
  content: string;
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
  const [answers, setAnswers] = useState<Record<string, string | boolean>>({});
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [managingReservation, setManagingReservation] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const managementLink = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const reservationId = params.get('reservationId');
    const token = params.get('token');
    return reservationId && token ? { reservationId, token } : null;
  }, []);

  const basePath = useMemo(
    () =>
      `/public/${encodeURIComponent(organizationSlug)}/${encodeURIComponent(
        workspaceSlug,
      )}/bookings/${encodeURIComponent(bookingSlug)}`,
    [bookingSlug, organizationSlug, workspaceSlug],
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      publicApi<PublicBookingPage>(basePath),
      publicApi<Slot[]>(
        `${basePath}/slots?dateFrom=${encodeURIComponent(
          dateRange.dateFrom,
        )}&dateTo=${encodeURIComponent(dateRange.dateTo)}`,
      ),
    ])
      .then(async ([nextPage, nextSlots]) => {
        if (cancelled) return;
        setPage(nextPage);
        setSlots(nextSlots);
        if (managementLink) {
          const managed = await publicApi<Omit<Reservation, 'managementToken'>>(
            `${basePath}/reservations/${encodeURIComponent(
              managementLink.reservationId,
            )}?token=${encodeURIComponent(managementLink.token)}`,
          );
          if (!cancelled) {
            setReservation({
              ...managed,
              managementToken: managementLink.token,
            });
          }
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
  }, [basePath, dateRange, managementLink]);

  const reloadSlots = async () => {
    const nextSlots = await publicApi<Slot[]>(
      `${basePath}/slots?dateFrom=${encodeURIComponent(
        dateRange.dateFrom,
      )}&dateTo=${encodeURIComponent(dateRange.dateTo)}`,
    );
    setSlots(nextSlots);
  };

  const submit = async (formEvent: FormEvent) => {
    formEvent.preventDefault();
    if (!selected || !page) return;
    setSubmitting(true);
    setError(null);
    try {
      if (reservation && managingReservation) {
        const result = await publicApi<Omit<Reservation, 'managementToken'>>(
          `${basePath}/reservations/${encodeURIComponent(reservation.id)}/reschedule`,
          {
            method: 'POST',
            body: JSON.stringify({
              managementToken: reservation.managementToken,
              startsAt: selected.startsAt,
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            }),
          },
        );
        setReservation({
          ...result,
          managementToken: reservation.managementToken,
        });
        setManagingReservation(false);
        setSelected(null);
        await reloadSlots();
      } else {
        const result = await publicApi<Reservation>(`${basePath}/reservations`, {
          method: 'POST',
          body: JSON.stringify({
            name,
            email,
            startsAt: selected.startsAt,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            answers,
          }),
        });
        setReservation(result);
        setSelected(null);
        await reloadSlots();
      }
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'The time could not be reserved');
    } finally {
      setSubmitting(false);
    }
  };

  const cancelReservation = async () => {
    if (!reservation || reservation.status === 'CANCELLED') return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await publicApi<Omit<Reservation, 'managementToken'>>(
        `${basePath}/reservations/${encodeURIComponent(reservation.id)}/cancel`,
        {
          method: 'POST',
          body: JSON.stringify({ managementToken: reservation.managementToken }),
        },
      );
      setReservation({
        ...result,
        managementToken: reservation.managementToken,
      });
      setManagingReservation(false);
      setSelected(null);
      await reloadSlots();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'The booking could not be cancelled');
    } finally {
      setSubmitting(false);
    }
  };

  const downloadCalendar = async () => {
    if (!reservation) return;
    setError(null);
    try {
      const file = await publicApi<CalendarFile>(
        `${basePath}/reservations/${encodeURIComponent(
          reservation.id,
        )}/calendar?token=${encodeURIComponent(reservation.managementToken)}`,
      );
      const blob = new Blob([file.content], { type: file.contentType });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = file.filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(href);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Calendar file could not be created');
    }
  };

  if (loading) return <PublicBookingState title="Loading availability…" />;
  if (error && !page) return <PublicBookingState title="Booking page unavailable" message={error} />;
  if (!page) return <PublicBookingState title="Booking page unavailable" />;

  return (
    <main className="public-flow-page booking-flow-page">
      <header className="public-flow-nav">
        <a className="public-wordmark" href="/">
          <span>S</span>
          Sessions
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

        {reservation && !managingReservation ? (
          <section className="public-action-card booking-success-card">
            <div className="public-success-state">
              <span>{reservation.status === 'CANCELLED' ? '×' : '✓'}</span>
              <h2>
                {reservation.status === 'CANCELLED'
                  ? 'This booking is cancelled.'
                  : 'Your meeting is scheduled.'}
              </h2>
              <p>
                {new Intl.DateTimeFormat(undefined, {
                  dateStyle: 'full',
                  timeStyle: 'short',
                }).format(new Date(reservation.startsAt))}
              </p>
              <small>
                {reservation.status === 'CANCELLED'
                  ? 'The linked scheduled session was cancelled too.'
                  : reservation.rescheduleCount > 0
                    ? `Rescheduled ${reservation.rescheduleCount} time${reservation.rescheduleCount === 1 ? '' : 's'}.`
                    : 'The scheduled session and reservation were created atomically.'}
              </small>
              <div className="booking-management-actions">
                <button type="button" onClick={() => void downloadCalendar()}>
                  Download calendar
                </button>
                {reservation.status === 'CONFIRMED' ? (
                  <>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        setManagingReservation(true);
                        setSelected(null);
                        setError(null);
                      }}
                    >
                      Reschedule
                    </button>
                    <button
                      type="button"
                      className="danger"
                      disabled={submitting}
                      onClick={() => void cancelReservation()}
                    >
                      {submitting ? 'Cancelling…' : 'Cancel booking'}
                    </button>
                  </>
                ) : null}
              </div>
              {error ? <div className="public-error booking-management-error">{error}</div> : null}
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
              <span className="public-kicker">
                {managingReservation ? 'Reschedule booking' : 'Your details'}
              </span>
              <h2>
                {selected
                  ? managingReservation
                    ? 'Move to this time'
                    : 'Confirm this time'
                  : 'Select an available time'}
              </h2>
              {selected ? (
                <div className="selected-slot-summary">
                  {new Intl.DateTimeFormat(undefined, {
                    dateStyle: 'full',
                    timeStyle: 'short',
                  }).format(new Date(selected.startsAt))}
                </div>
              ) : null}
              <form className="public-form" onSubmit={submit}>
                {!managingReservation ? (
                  <>
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
                    {page.intakeFields.map((field) => (
                      <IntakeFieldControl
                        key={field.key}
                        field={field}
                        value={answers[field.key]}
                        onChange={(value) =>
                          setAnswers((current) => ({
                            ...current,
                            [field.key]: value,
                          }))
                        }
                      />
                    ))}
                  </>
                ) : (
                  <div className="public-form-note">
                    Your secure booking-management token will be used to update the existing
                    reservation and its linked meeting.
                  </div>
                )}
                {error ? <div className="public-error">{error}</div> : null}
                <button
                  disabled={
                    submitting ||
                    !selected ||
                    (!managingReservation && (!name.trim() || !email.trim()))
                  }
                >
                  {submitting
                    ? managingReservation
                      ? 'Rescheduling…'
                      : 'Scheduling…'
                    : managingReservation
                      ? 'Confirm new time'
                      : 'Schedule meeting'}
                </button>
                {managingReservation ? (
                  <button
                    type="button"
                    className="public-cancel-management"
                    onClick={() => {
                      setManagingReservation(false);
                      setSelected(null);
                      setError(null);
                    }}
                  >
                    Keep current time
                  </button>
                ) : null}
              </form>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}

function IntakeFieldControl({
  field,
  value,
  onChange,
}: {
  field: IntakeField;
  value: string | boolean | undefined;
  onChange: (value: string | boolean) => void;
}) {
  if (field.type === 'CHECKBOX' || field.type === 'CONSENT') {
    return (
      <label className="public-checkbox-field">
        <input
          type="checkbox"
          required={field.required}
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>{field.label}</span>
      </label>
    );
  }

  if (field.type === 'TEXTAREA') {
    return (
      <label>
        {field.label}
        <textarea
          required={field.required}
          maxLength={5000}
          rows={4}
          value={typeof value === 'string' ? value : ''}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    );
  }

  if (field.type === 'SELECT') {
    return (
      <label>
        {field.label}
        <select
          required={field.required}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Choose an option</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label>
      {field.label}
      <input
        required={field.required}
        type={field.type === 'EMAIL' ? 'email' : 'text'}
        maxLength={1000}
        value={typeof value === 'string' ? value : ''}
        placeholder={field.placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
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
