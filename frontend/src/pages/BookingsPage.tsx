import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateBookingPageInput, PublicFormField } from '@sessions/contracts';
import { FormEvent, useState } from 'react';
import { api, type BookingPageRecord } from '../api/client';

function toLocalDateTimeInput(value: string): string {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

const WEEKDAY_RULES = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  startTime: '09:00',
  endTime: '17:00',
}));

export function BookingsPage() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [minimumNoticeMinutes, setMinimumNoticeMinutes] = useState(120);
  const [intakeFields, setIntakeFields] = useState<PublicFormField[]>([]);
  const [selectedBookingId, setSelectedBookingId] = useState('');
  const [rescheduleReservationId, setRescheduleReservationId] = useState('');
  const [rescheduleStartsAt, setRescheduleStartsAt] = useState('');

  const bookings = useQuery({ queryKey: ['bookings'], queryFn: () => api.listBookings() });
  const create = useMutation({
    mutationFn: (input: CreateBookingPageInput) => api.createBooking(input),
    onSuccess: async () => {
      setTitle('');
      setSlug('');
      setSlugEdited(false);
      setIntakeFields([]);
      await queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
  });
  const reservations = useQuery({
    queryKey: ['booking-reservations', selectedBookingId],
    queryFn: () => api.listBookingReservations(selectedBookingId),
    enabled: Boolean(selectedBookingId),
  });

  const toggle = useMutation({
    mutationFn: (page: BookingPageRecord) =>
      api.updateBooking(page.id, page.version, { active: !page.active }),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['bookings'] }),
  });

  const reschedule = useMutation({
    mutationFn: (input: { reservationId: string; version: number; startsAt: string }) =>
      api.rescheduleBookingReservation(
        selectedBookingId,
        input.reservationId,
        input.version,
        {
          startsAt: new Date(input.startsAt).toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      ),
    onSuccess: async () => {
      setRescheduleReservationId('');
      setRescheduleStartsAt('');
      await queryClient.invalidateQueries({
        queryKey: ['booking-reservations', selectedBookingId],
      });
      await queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
  });

  const cancelReservation = useMutation({
    mutationFn: (input: { reservationId: string; version: number }) =>
      api.cancelBookingReservation(
        selectedBookingId,
        input.reservationId,
        input.version,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['booking-reservations', selectedBookingId],
      });
      await queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
  });

  const downloadCalendar = useMutation({
    mutationFn: (reservationId: string) =>
      api.getBookingReservationCalendar(selectedBookingId, reservationId),
    onSuccess: (calendar) => {
      const blob = new Blob([calendar.content], { type: calendar.mimeType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = calendar.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    },
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
      durationMinutes,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      minimumNoticeMinutes,
      bufferBeforeMinutes: 10,
      bufferAfterMinutes: 10,
      availabilityRules: WEEKDAY_RULES,
      intakeFields,
    });
  };

  return (
    <div className="workflow-page">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Scheduling</span>
          <h1>Let the right people book the right time.</h1>
          <p>
            Booking pages use IANA timezones, lead-time rules, buffer windows, slot locking,
            and atomic reservation-to-session creation.
          </p>
        </div>
        <div className="feature-state-card">
          <span>Implemented vertical slice</span>
          <strong>Availability → slot → session</strong>
          <small>Google and Microsoft calendars now contribute busy-time conflicts and booking event synchronization.</small>
        </div>
      </section>

      <div className="workflow-layout">
        <section className="panel workflow-list-panel">
          <div className="panel-heading">
            <div><span className="eyebrow">Shareable schedules</span><h2>Booking pages</h2></div>
            <span className="count-pill">{bookings.data?.length ?? 0}</span>
          </div>
          {bookings.isLoading ? <div className="empty-panel">Loading booking pages…</div> : null}
          {bookings.error ? <div className="error-banner">{bookings.error.message}</div> : null}
          {bookings.data?.length === 0 ? (
            <div className="empty-panel"><span>◷</span><h3>No booking pages yet</h3><p>Create a service, then expose its public slot and reservation endpoints.</p></div>
          ) : null}
          <div className="workflow-card-list">
            {bookings.data?.map((page) => (
              <article className="workflow-card" key={page.id}>
                <div className="workflow-card-main">
                  <div className="workflow-card-title">
                    <span className={page.active ? 'state-chip enabled' : 'state-chip'}>{page.active ? 'Active' : 'Paused'}</span>
                    <h3>{page.title}</h3>
                  </div>
                  <p>{page.durationMinutes} min · {page.timezone} · {page.minimumNoticeMinutes} min notice</p>
                  <div className="workflow-meta">
                    <span>{page._count?.reservations ?? 0} reservations</span>
                    <span>{page.availabilityRules.length} availability windows</span>
                    <span>/{page.slug}</span>
                  </div>
                </div>
                <div className="workflow-actions">
                  <button
                    className="button secondary"
                    onClick={() => setSelectedBookingId(page.id)}
                  >
                    Reservations
                  </button>
                  <button className="button secondary" onClick={() => toggle.mutate(page)} disabled={toggle.isPending}>
                    {page.active ? 'Pause' : 'Activate'}
                  </button>
                </div>
              </article>
            ))}
          </div>
          {selectedBookingId ? (
            <section className="booking-reservation-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Reservation operations</span>
                  <h2>Manage confirmed bookings</h2>
                </div>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => setSelectedBookingId('')}
                >
                  Close
                </button>
              </div>
              {reservations.isLoading ? (
                <div className="empty-panel">Loading reservations…</div>
              ) : null}
              {reservations.error ? (
                <div className="error-banner">{reservations.error.message}</div>
              ) : null}
              {reservations.data?.length === 0 ? (
                <div className="empty-panel">No reservations for this booking page yet.</div>
              ) : null}
              <div className="booking-reservation-list">
                {reservations.data?.map((reservation) => (
                  <article className="booking-reservation-card" key={reservation.id}>
                    <div>
                      <span
                        className={
                          reservation.status === 'CONFIRMED'
                            ? 'state-chip enabled'
                            : 'state-chip'
                        }
                      >
                        {reservation.status}
                      </span>
                      <h3>{reservation.name}</h3>
                      <p>{reservation.email}</p>
                      <small>
                        {new Intl.DateTimeFormat(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(new Date(reservation.startsAt))}
                        {' · '}
                        {reservation.timezone}
                      </small>
                      {reservation.calendarEventSyncs?.length ? (
                        <div className="booking-calendar-syncs">
                          {reservation.calendarEventSyncs.map((sync) => (
                            <span
                              key={sync.id}
                              className={
                                sync.status === 'SYNCED'
                                  ? 'state-chip enabled'
                                  : sync.status === 'FAILED'
                                    ? 'state-chip error'
                                    : 'state-chip'
                              }
                              title={sync.failureCode || undefined}
                            >
                              {sync.provider.toLowerCase()} · {sync.status.toLowerCase()}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="booking-reservation-actions">
                      <button
                        className="button secondary"
                        type="button"
                        disabled={downloadCalendar.isPending}
                        onClick={() => downloadCalendar.mutate(reservation.id)}
                      >
                        Download ICS
                      </button>
                      {reservation.status === 'CONFIRMED' ? (
                        <>
                          <button
                            className="button secondary"
                            type="button"
                            onClick={() => {
                              setRescheduleReservationId(reservation.id);
                              setRescheduleStartsAt(
                                toLocalDateTimeInput(reservation.startsAt),
                              );
                            }}
                          >
                            Reschedule
                          </button>
                          <button
                            className="button secondary"
                            type="button"
                            disabled={cancelReservation.isPending}
                            onClick={() => {
                              if (window.confirm('Cancel this reservation and its linked session?')) {
                                cancelReservation.mutate({
                                  reservationId: reservation.id,
                                  version: reservation.version,
                                });
                              }
                            }}
                          >
                            Cancel
                          </button>
                        </>
                      ) : null}
                    </div>
                    {rescheduleReservationId === reservation.id ? (
                      <div className="booking-reschedule-row">
                        <input
                          type="datetime-local"
                          value={rescheduleStartsAt}
                          onChange={(event) => setRescheduleStartsAt(event.target.value)}
                        />
                        <button
                          className="button primary"
                          type="button"
                          disabled={reschedule.isPending || !rescheduleStartsAt}
                          onClick={() =>
                            reschedule.mutate({
                              reservationId: reservation.id,
                              version: reservation.version,
                              startsAt: rescheduleStartsAt,
                            })
                          }
                        >
                          {reschedule.isPending ? 'Saving…' : 'Save new time'}
                        </button>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
              {reschedule.error ? (
                <div className="error-banner">{reschedule.error.message}</div>
              ) : null}
              {cancelReservation.error ? (
                <div className="error-banner">{cancelReservation.error.message}</div>
              ) : null}
              {downloadCalendar.error ? (
                <div className="error-banner">{downloadCalendar.error.message}</div>
              ) : null}
            </section>
          ) : null}
        </section>

        <aside className="panel workflow-create-panel">
          <span className="eyebrow">New booking page</span>
          <h2>Publish a dependable schedule.</h2>
          <p>The first version uses Monday–Friday, 09:00–17:00 in your current timezone.</p>
          <form className="form-stack" onSubmit={submit}>
            <label>
              Service title
              <input required maxLength={160} value={title} onChange={(event) => updateTitle(event.target.value)} placeholder="30-minute discovery call" />
            </label>
            <label>
              Public slug
              <input required minLength={2} maxLength={100} value={slug} onChange={(event) => { setSlugEdited(true); setSlug(toSlug(event.target.value)); }} placeholder="discovery-call" />
            </label>
            <div className="custom-field-builder">
              <div className="custom-field-builder-heading">
                <div>
                  <strong>Intake form</strong>
                  <small>Collect extra information before the meeting.</small>
                </div>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() =>
                    setIntakeFields((fields) => [
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
              {intakeFields.map((field, index) => (
                <div className="custom-field-row" key={`${field.key}-${index}`}>
                  <input
                    aria-label="Field label"
                    maxLength={160}
                    value={field.label}
                    onChange={(event) =>
                      setIntakeFields((fields) =>
                        fields.map((candidate, candidateIndex) =>
                          candidateIndex === index
                            ? {
                                ...candidate,
                                label: event.target.value,
                                key:
                                  toSlug(event.target.value).replace(/-/g, '_') ||
                                  `question_${index + 1}`,
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
                      setIntakeFields((fields) =>
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
                        setIntakeFields((fields) =>
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
                      setIntakeFields((fields) =>
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
                        setIntakeFields((fields) =>
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
            <div className="form-grid">
              <label>
                Duration
                <select value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))}>
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={45}>45 minutes</option>
                  <option value={60}>60 minutes</option>
                </select>
              </label>
              <label>
                Minimum notice
                <select value={minimumNoticeMinutes} onChange={(event) => setMinimumNoticeMinutes(Number(event.target.value))}>
                  <option value={60}>1 hour</option>
                  <option value={120}>2 hours</option>
                  <option value={1440}>24 hours</option>
                </select>
              </label>
            </div>
            {create.error ? <div className="error-banner">{create.error.message}</div> : null}
            <button className="button primary full-width" disabled={create.isPending || !title.trim() || slug.length < 2}>
              {create.isPending ? 'Creating…' : 'Create booking page'}
            </button>
          </form>
        </aside>
      </div>
    </div>
  );
}
