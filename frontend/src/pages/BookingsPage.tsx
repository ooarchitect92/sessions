import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateBookingPageInput } from '@sessions/contracts';
import { FormEvent, useState } from 'react';
import { api, type BookingPageRecord } from '../api/client';

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

  const bookings = useQuery({ queryKey: ['bookings'], queryFn: () => api.listBookings() });
  const create = useMutation({
    mutationFn: (input: CreateBookingPageInput) => api.createBooking(input),
    onSuccess: async () => {
      setTitle('');
      setSlug('');
      setSlugEdited(false);
      await queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
  });
  const toggle = useMutation({
    mutationFn: (page: BookingPageRecord) =>
      api.updateBooking(page.id, page.version, { active: !page.active }),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['bookings'] }),
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
      intakeFields: [],
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
          <small>Google and Microsoft calendar busy-time adapters are the next conflict source to add.</small>
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
                  <button className="button secondary" onClick={() => toggle.mutate(page)} disabled={toggle.isPending}>
                    {page.active ? 'Pause' : 'Activate'}
                  </button>
                </div>
              </article>
            ))}
          </div>
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
