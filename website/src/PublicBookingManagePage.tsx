import { useEffect, useMemo, useState } from 'react';
import { publicApi } from './public-api';

interface ManagedReservation {
  id: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  status: 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';
  version: number;
  rescheduledAt: string | null;
  cancelledAt: string | null;
  session: { id: string; title: string } | null;
}

interface Slot {
  startsAt: string;
  endsAt: string;
}

function calendarDate(value: Date): string {
  return `${value.getFullYear().toString().padStart(4, '0')}-${(value.getMonth() + 1)
    .toString()
    .padStart(2, '0')}-${value.getDate().toString().padStart(2, '0')}`;
}

export function PublicBookingManagePage({
  organizationSlug,
  workspaceSlug,
  bookingSlug,
  reservationId,
}: {
  organizationSlug: string;
  workspaceSlug: string;
  bookingSlug: string;
  reservationId: string;
}) {
  const token = useMemo(() => new URLSearchParams(window.location.search).get('token') ?? '', []);
  const basePath = `/public/${encodeURIComponent(organizationSlug)}/${encodeURIComponent(
    workspaceSlug,
  )}/bookings/${encodeURIComponent(bookingSlug)}`;
  const [reservation, setReservation] = useState<ManagedReservation | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selected, setSelected] = useState<Slot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadReservation = async () => {
    const result = await publicApi<ManagedReservation>(
      `${basePath}/reservations/${encodeURIComponent(
        reservationId,
      )}/manage?token=${encodeURIComponent(token)}`,
    );
    setReservation(result);
    return result;
  };

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setError('This booking management link is invalid.');
      setLoading(false);
      return;
    }
    const start = new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + 14);
    Promise.all([
      publicApi<ManagedReservation>(
        `${basePath}/reservations/${encodeURIComponent(
          reservationId,
        )}/manage?token=${encodeURIComponent(token)}`,
      ),
      publicApi<Slot[]>(
        `${basePath}/slots?dateFrom=${encodeURIComponent(
          calendarDate(start),
        )}&dateTo=${encodeURIComponent(calendarDate(end))}`,
      ),
    ])
      .then(([managed, available]) => {
        if (!cancelled) {
          setReservation(managed);
          setSlots(available);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'This booking link could not be opened');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [basePath, reservationId, token]);

  const reschedule = async () => {
    if (!selected || !reservation) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await publicApi<ManagedReservation>(
        `${basePath}/reservations/${encodeURIComponent(
          reservation.id,
        )}/reschedule?token=${encodeURIComponent(token)}`,
        {
          method: 'POST',
          body: JSON.stringify({
            startsAt: selected.startsAt,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        },
      );
      setReservation(updated);
      setSelected(null);
      const start = new Date();
      const end = new Date(start);
      end.setDate(end.getDate() + 14);
      setSlots(
        await publicApi<Slot[]>(
          `${basePath}/slots?dateFrom=${encodeURIComponent(
            calendarDate(start),
          )}&dateTo=${encodeURIComponent(calendarDate(end))}`,
        ),
      );
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'The booking could not be rescheduled');
    } finally {
      setSaving(false);
    }
  };

  const cancel = async () => {
    if (!reservation || !window.confirm('Cancel this booking?')) return;
    setSaving(true);
    setError(null);
    try {
      await publicApi<ManagedReservation>(
        `${basePath}/reservations/${encodeURIComponent(
          reservation.id,
        )}/cancel?token=${encodeURIComponent(token)}`,
        { method: 'POST' },
      );
      await loadReservation();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'The booking could not be cancelled');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <ManageState title="Loading your booking…" />;
  }
  if (!reservation) {
    return error ? (
      <ManageState title="Booking link unavailable" message={error} />
    ) : (
      <ManageState title="Booking link unavailable" />
    );
  }

  return (
    <main className="public-flow-page booking-flow-page">
      <header className="public-flow-nav">
        <a className="public-wordmark" href="/">
          <span>S</span>
          Sessions
        </a>
        <span className="public-live-label">Secure booking management</span>
      </header>

      <div className="public-booking-shell">
        <section className="booking-intro">
          <span className="public-kicker">Manage booking</span>
          <h1>{reservation.session?.title ?? 'Scheduled meeting'}</h1>
          <p>
            {reservation.status === 'CONFIRMED'
              ? 'Choose a new available time or cancel this booking using your private management link.'
              : 'This booking is no longer active.'}
          </p>
          <div className="booking-facts">
            <span>
              ◷{' '}
              {new Intl.DateTimeFormat(undefined, {
                dateStyle: 'full',
                timeStyle: 'short',
              }).format(new Date(reservation.startsAt))}
            </span>
            <span>⌁ {reservation.timezone}</span>
            <span>● {reservation.status.toLowerCase()}</span>
          </div>
        </section>

        {reservation.status === 'CONFIRMED' ? (
          <div className="public-booking-grid">
            <section className="slot-panel">
              <div className="slot-panel-heading">
                <div>
                  <span className="public-kicker">Reschedule</span>
                  <h2>Choose a new time</h2>
                </div>
                <span>{slots.length} slots</span>
              </div>
              <div className="slot-grid">
                {slots.slice(0, 60).map((slot) => {
                  const active = selected?.startsAt === slot.startsAt;
                  return (
                    <button
                      className={active ? 'selected' : ''}
                      key={slot.startsAt}
                      type="button"
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
            </section>

            <aside className="public-action-card">
              <span className="public-kicker">Booking controls</span>
              <h2>{selected ? 'Confirm new time' : 'Your current booking'}</h2>
              {selected ? (
                <div className="selected-slot-summary">
                  {new Intl.DateTimeFormat(undefined, {
                    dateStyle: 'full',
                    timeStyle: 'short',
                  }).format(new Date(selected.startsAt))}
                </div>
              ) : null}
              {error ? <div className="public-error">{error}</div> : null}
              <button disabled={!selected || saving} onClick={reschedule} type="button">
                {saving ? 'Saving…' : 'Reschedule booking'}
              </button>
              <button
                className="public-danger-button"
                disabled={saving}
                onClick={cancel}
                type="button"
              >
                Cancel booking
              </button>
              <small>
                This private link is required for changes. Do not forward it to someone who should
                not control the booking.
              </small>
            </aside>
          </div>
        ) : (
          <section className="public-action-card booking-success-card">
            <div className="public-success-state">
              <span>✓</span>
              <h2>Booking cancelled.</h2>
              <p>No further booking reminders will be sent.</p>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function ManageState({ title, message }: { title: string; message?: string }) {
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
