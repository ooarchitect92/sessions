import { FormEvent, useMemo, useState } from 'react';
import { publicApi } from './public-api';

type LeadKind = 'DEMO' | 'CONTACT' | 'NEWSLETTER';

function approvedQueryValue(query: URLSearchParams, key: string): string | undefined {
  const value = query.get(key)?.trim();
  if (!value) return undefined;
  return value.slice(0, 160);
}

export function MarketingLeadForm({
  kind,
  compact = false,
  title,
  submitLabel,
}: {
  kind: LeadKind;
  compact?: boolean;
  title?: string;
  submitLabel?: string;
}) {
  const query = useMemo(() => new URLSearchParams(window.location.search), []);
  const [form, setForm] = useState({
    name: '',
    email: '',
    company: '',
    teamSize: '',
    message: '',
    website: '',
    consent: false,
  });
  const [submissionKey, setSubmissionKey] = useState(() => crypto.randomUUID());
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  const [receiptReference, setReceiptReference] = useState('');
  const newsletter = kind === 'NEWSLETTER';
  const set = (key: string, value: string | boolean) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setStatus('sending');
    setError('');
    try {
      const result = await publicApi<{
        receiptReference: string;
        conversionEventId: string | null;
        status: 'RECEIVED';
      }>('/public/marketing/leads', {
        method: 'POST',
        body: JSON.stringify({
          submissionKey,
          kind,
          name: form.name.trim() || undefined,
          email: form.email.trim(),
          company: form.company.trim() || undefined,
          teamSize: form.teamSize || undefined,
          message: form.message.trim() || undefined,
          website: form.website,
          consent: form.consent,
          sourcePath: window.location.pathname,
          metadata: {
            actionId: newsletter ? 'footer_product_updates' : 'contact_request',
            intent: approvedQueryValue(query, 'intent'),
            utmSource: approvedQueryValue(query, 'utm_source'),
            utmMedium: approvedQueryValue(query, 'utm_medium'),
            utmCampaign: approvedQueryValue(query, 'utm_campaign'),
            utmContent: approvedQueryValue(query, 'utm_content'),
            utmTerm: approvedQueryValue(query, 'utm_term'),
          },
        }),
      });
      setReceiptReference(result.receiptReference);
      setStatus('success');
      setForm({
        name: '',
        email: '',
        company: '',
        teamSize: '',
        message: '',
        website: '',
        consent: false,
      });
      setSubmissionKey(crypto.randomUUID());
    } catch (caught) {
      setStatus('error');
      setError(
        caught instanceof Error
          ? caught.message
          : 'Your request could not be submitted. Please retry.',
      );
    }
  }

  if (status === 'success') {
    return (
      <div className={compact ? 'lead-success compact' : 'lead-success'} role="status">
        <span aria-hidden="true">✓</span>
        <div>
          <strong>{newsletter ? 'Update request saved.' : 'Request received.'}</strong>
          <p>
            {newsletter
              ? 'The backend accepted your request to receive product updates.'
              : 'The backend durably accepted your enquiry. You do not need to submit it again.'}
          </p>
          {receiptReference ? (
            <p className="receipt-reference">
              Reference: <code>{receiptReference}</code>
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <form
      className={compact ? 'lead-form compact' : 'lead-form'}
      onSubmit={submit}
      noValidate={false}
    >
      {title ? <h3>{title}</h3> : null}
      <label className="hp-field" aria-hidden="true">
        Website
        <input
          tabIndex={-1}
          autoComplete="off"
          value={form.website}
          onChange={(event) => set('website', event.target.value)}
        />
      </label>
      {newsletter ? (
        <label>
          Email address
          <input
            required
            type="email"
            maxLength={320}
            autoComplete="email"
            placeholder="you@company.com"
            value={form.email}
            onChange={(event) => set('email', event.target.value)}
          />
        </label>
      ) : (
        <div className="form-grid">
          <label>
            Full name
            <input
              required
              maxLength={160}
              autoComplete="name"
              placeholder="Your name"
              value={form.name}
              onChange={(event) => set('name', event.target.value)}
            />
          </label>
          <label>
            Work email
            <input
              required
              type="email"
              maxLength={320}
              autoComplete="email"
              placeholder="you@company.com"
              value={form.email}
              onChange={(event) => set('email', event.target.value)}
            />
          </label>
          <label>
            Company <span className="optional-note">Optional</span>
            <input
              maxLength={160}
              autoComplete="organization"
              placeholder="Company name"
              value={form.company}
              onChange={(event) => set('company', event.target.value)}
            />
          </label>
          <label>
            Team size <span className="optional-note">Optional</span>
            <select value={form.teamSize} onChange={(event) => set('teamSize', event.target.value)}>
              <option value="">Select</option>
              <option>1-5</option>
              <option>6-20</option>
              <option>21-50</option>
              <option>51-200</option>
              <option>201+</option>
            </select>
          </label>
        </div>
      )}
      {!newsletter ? (
        <label>
          What would you like to improve? <span className="optional-note">Optional</span>
          <textarea
            maxLength={4000}
            placeholder="Tell us about your meeting, webinar, scheduling, or collaboration workflow."
            value={form.message}
            onChange={(event) => set('message', event.target.value)}
          />
        </label>
      ) : null}
      <label className="consent-row">
        <input
          required
          type="checkbox"
          checked={form.consent}
          onChange={(event) => set('consent', event.target.checked)}
        />
        <span>
          {newsletter
            ? 'I agree that Sessions can use this email to send product updates.'
            : 'I agree that Sessions can use these details to respond to this request.'}
        </span>
      </label>
      {status === 'error' ? (
        <div className="form-error" role="alert" aria-live="assertive">
          <strong>Submission was not accepted.</strong>
          <span>{error}</span>
        </div>
      ) : null}
      <button
        className="btn primary wide"
        disabled={
          status === 'sending' ||
          !form.email.trim() ||
          !form.consent ||
          (!newsletter && !form.name.trim())
        }
      >
        {status === 'sending'
          ? 'Submitting…'
          : submitLabel ?? (newsletter ? 'Join updates' : 'Request a demo')}
      </button>
    </form>
  );
}
