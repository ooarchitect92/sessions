import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  api,
  type NotificationKind,
  type NotificationTemplateRecord,
} from '../api/client';
import { useAuth } from '../auth/AuthContext';

const KIND_LABELS: Record<NotificationKind, string> = {
  BOOKING_CONFIRMATION: 'Booking confirmation',
  BOOKING_REMINDER_24H: 'Booking reminder · 24 hours',
  BOOKING_REMINDER_1H: 'Booking reminder · 1 hour',
  EVENT_REGISTRATION_CONFIRMATION: 'Event registration confirmation',
  EVENT_REMINDER_24H: 'Event reminder · 24 hours',
  EVENT_REMINDER_1H: 'Event reminder · 1 hour',
};

function formatDate(value: string | null): string {
  if (!value) return 'Not sent';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function NotificationSettings() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const canManage =
    auth.me?.principal.roles.some((role) => ['OWNER', 'ADMIN'].includes(role)) ??
    false;

  const templates = useQuery({
    queryKey: ['notification-templates'],
    queryFn: () => api.listNotificationTemplates(),
    enabled: canManage,
  });
  const deliveries = useQuery({
    queryKey: ['notification-deliveries'],
    queryFn: () => api.listNotificationDeliveries(100),
    enabled: canManage,
    refetchInterval: 30_000,
  });

  const [selectedKind, setSelectedKind] =
    useState<NotificationKind>('BOOKING_CONFIRMATION');
  const selected = useMemo(
    () => templates.data?.find((template) => template.kind === selectedKind),
    [selectedKind, templates.data],
  );
  const [subject, setSubject] = useState('');
  const [textBody, setTextBody] = useState('');
  const [htmlBody, setHtmlBody] = useState('');
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!selected) return;
    setSubject(selected.subjectTemplate);
    setTextBody(selected.textTemplate);
    setHtmlBody(selected.htmlTemplate ?? '');
    setActive(selected.active);
  }, [selected]);

  const save = useMutation({
    mutationFn: () =>
      api.saveNotificationTemplate({
        kind: selectedKind,
        subjectTemplate: subject,
        textTemplate: textBody,
        htmlTemplate: htmlBody || null,
        active,
      }),
    onSuccess: async () =>
      queryClient.invalidateQueries({ queryKey: ['notification-templates'] }),
  });

  const reset = useMutation({
    mutationFn: () => api.resetNotificationTemplate(selectedKind),
    onSuccess: async () =>
      queryClient.invalidateQueries({ queryKey: ['notification-templates'] }),
  });

  const retry = useMutation({
    mutationFn: (id: string) => api.retryNotificationDelivery(id),
    onSuccess: async () =>
      queryClient.invalidateQueries({ queryKey: ['notification-deliveries'] }),
  });

  if (!canManage) {
    return (
      <div className="settings-stack">
        <section className="panel settings-panel">
          <div className="error-banner">
            Notification templates and delivery logs require an owner or admin role.
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="settings-stack">
      <section className="panel settings-panel">
        <div className="settings-panel-heading">
          <div>
            <span className="eyebrow">Transactional communication</span>
            <h2>Email templates and reminders</h2>
            <p>
              Booking confirmations, event registrations, and 24-hour / 1-hour
              reminders are persisted before delivery and retried from a durable
              ledger.
            </p>
          </div>
        </div>

        {templates.isLoading ? <div className="settings-empty-row">Loading templates…</div> : null}
        {templates.error ? <div className="error-banner">{templates.error.message}</div> : null}

        {selected ? (
          <form
            className="settings-form"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            <label>
              Message type
              <select
                value={selectedKind}
                onChange={(event) =>
                  setSelectedKind(event.target.value as NotificationKind)
                }
              >
                {Object.entries(KIND_LABELS).map(([kind, label]) => (
                  <option value={kind} key={kind}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Subject
              <input
                required
                maxLength={300}
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
              />
            </label>
            <label>
              Plain-text message
              <textarea
                required
                rows={8}
                maxLength={20000}
                value={textBody}
                onChange={(event) => setTextBody(event.target.value)}
              />
            </label>
            <label>
              HTML message
              <textarea
                rows={8}
                maxLength={50000}
                value={htmlBody}
                onChange={(event) => setHtmlBody(event.target.value)}
              />
            </label>
            <label className="settings-toggle-row">
              <input
                type="checkbox"
                checked={active}
                onChange={(event) => setActive(event.target.checked)}
              />
              <span>
                <strong>Enable this notification</strong>
                <small>
                  Disable a template to stop planning new deliveries of that type.
                </small>
              </span>
            </label>
            <div className="development-token-box">
              <div>
                <strong>Supported variables</strong>
                <small>
                  Use double-brace variables in the subject or body.
                </small>
              </div>
              <code>
                {'{{name}} {{title}} {{startsAt}} {{timezone}} {{workspaceName}} {{organizationName}} {{manageUrl}} {{eventUrl}} {{status}}'}
              </code>
            </div>
            {save.error ? <div className="error-banner">{save.error.message}</div> : null}
            {save.isSuccess ? <div className="success-banner">Template saved.</div> : null}
            {reset.error ? <div className="error-banner">{reset.error.message}</div> : null}
            <div className="settings-actions">
              <button
                className="button primary"
                disabled={save.isPending || !subject.trim() || !textBody.trim()}
              >
                {save.isPending ? 'Saving…' : 'Save template'}
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={reset.isPending || !selected.custom}
                onClick={() => {
                  if (window.confirm('Reset this message to the system default?')) {
                    reset.mutate();
                  }
                }}
              >
                Reset default
              </button>
            </div>
          </form>
        ) : null}
      </section>

      <section className="panel settings-panel">
        <div className="settings-panel-heading compact-settings-heading">
          <div>
            <span className="eyebrow">Delivery reconciliation</span>
            <h2>Recent notification deliveries</h2>
          </div>
          <span className="count-pill">{deliveries.data?.length ?? 0}</span>
        </div>
        {deliveries.isLoading ? <div className="settings-empty-row">Loading deliveries…</div> : null}
        {deliveries.error ? <div className="error-banner">{deliveries.error.message}</div> : null}
        <div className="settings-table">
          {deliveries.data?.map((delivery) => (
            <div className="settings-table-row notification-delivery-row" key={delivery.id}>
              <div className="member-copy">
                <strong>{KIND_LABELS[delivery.kind]}</strong>
                <span>{delivery.recipientEmail}</span>
                <small>
                  Scheduled {formatDate(delivery.scheduledFor)} · Sent {formatDate(delivery.sentAt)} · Attempts {delivery.attemptCount}
                </small>
                {delivery.lastError ? (
                  <small className="danger-text">{delivery.lastError}</small>
                ) : null}
              </div>
              <span className={'invitation-status status-' + delivery.status.toLowerCase()}>
                {delivery.status.toLowerCase()}
              </span>
              {delivery.status === 'FAILED' ? (
                <button
                  type="button"
                  className="settings-row-action"
                  disabled={retry.isPending}
                  onClick={() => retry.mutate(delivery.id)}
                >
                  Retry
                </button>
              ) : null}
            </div>
          ))}
          {deliveries.data?.length === 0 ? (
            <div className="settings-empty-row">No notification deliveries yet.</div>
          ) : null}
        </div>
        {retry.error ? <div className="error-banner">{retry.error.message}</div> : null}
      </section>
    </div>
  );
}
