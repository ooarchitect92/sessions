import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateBookingPageInput,
  IntakeField,
  IntakeFieldType,
} from '@sessions/contracts';
import { FormEvent, useState } from 'react';
import { api, type BookingPageRecord } from '../api/client';

function toFieldKey(value: string): string {
  const key = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return /^[a-z]/.test(key) ? key : `field_${key || 'value'}`;
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
  const [intakeFields, setIntakeFields] = useState<IntakeField[]>([]);
  const [fieldLabel, setFieldLabel] = useState('');
  const [fieldType, setFieldType] = useState<IntakeFieldType>('TEXT');
  const [fieldRequired, setFieldRequired] = useState(false);
  const [fieldOptions, setFieldOptions] = useState('');

  const bookings = useQuery({ queryKey: ['bookings'], queryFn: () => api.listBookings() });
  const create = useMutation({
    mutationFn: (input: CreateBookingPageInput) => api.createBooking(input),
    onSuccess: async () => {
      setTitle('');
      setSlug('');
      setSlugEdited(false);
      setIntakeFields([]);
      setFieldLabel('');
      setFieldType('TEXT');
      setFieldRequired(false);
      setFieldOptions('');
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

  const addIntakeField = () => {
    const label = fieldLabel.trim();
    if (!label) return;

    const baseKey = toFieldKey(label);
    let key = baseKey;
    let suffix = 2;
    while (intakeFields.some((field) => field.key === key)) {
      key = `${baseKey.slice(0, 58)}_${suffix}`;
      suffix += 1;
    }

    const options =
      fieldType === 'SELECT'
        ? fieldOptions
            .split(',')
            .map((option) => option.trim())
            .filter(Boolean)
        : undefined;
    if (fieldType === 'SELECT' && (!options || options.length === 0)) return;

    setIntakeFields((current) => [
      ...current,
      {
        key,
        label,
        type: fieldType,
        required: fieldRequired,
        ...(options ? { options } : {}),
      },
    ]);
    setFieldLabel('');
    setFieldType('TEXT');
    setFieldRequired(false);
    setFieldOptions('');
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

            <div className="intake-builder">
              <div className="intake-builder-heading">
                <div>
                  <strong>Intake form</strong>
                  <small>{intakeFields.length} fields</small>
                </div>
              </div>
              <label>
                Field label
                <input
                  maxLength={160}
                  value={fieldLabel}
                  onChange={(event) => setFieldLabel(event.target.value)}
                  placeholder="Company name"
                />
              </label>
              <div className="form-grid">
                <label>
                  Field type
                  <select
                    value={fieldType}
                    onChange={(event) =>
                      setFieldType(event.target.value as IntakeFieldType)
                    }
                  >
                    <option value="TEXT">Text</option>
                    <option value="TEXTAREA">Long text</option>
                    <option value="EMAIL">Email</option>
                    <option value="SELECT">Select</option>
                    <option value="CHECKBOX">Checkbox</option>
                    <option value="CONSENT">Consent</option>
                  </select>
                </label>
                <label className="inline-checkbox-field">
                  <input
                    type="checkbox"
                    checked={fieldRequired}
                    onChange={(event) => setFieldRequired(event.target.checked)}
                  />
                  Required
                </label>
              </div>
              {fieldType === 'SELECT' ? (
                <label>
                  Options
                  <input
                    value={fieldOptions}
                    onChange={(event) => setFieldOptions(event.target.value)}
                    placeholder="1-10, 11-50, 51+"
                  />
                </label>
              ) : null}
              <button
                type="button"
                className="button secondary full-width"
                onClick={addIntakeField}
                disabled={
                  !fieldLabel.trim() ||
                  (fieldType === 'SELECT' && !fieldOptions.trim())
                }
              >
                Add intake field
              </button>
              {intakeFields.length > 0 ? (
                <div className="intake-field-list">
                  {intakeFields.map((field) => (
                    <div key={field.key} className="intake-field-row">
                      <span>
                        <strong>{field.label}</strong>
                        <small>
                          {field.type.toLowerCase()} ·{' '}
                          {field.required ? 'required' : 'optional'}
                        </small>
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${field.label}`}
                        onClick={() =>
                          setIntakeFields((current) =>
                            current.filter((candidate) => candidate.key !== field.key),
                          )
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
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
