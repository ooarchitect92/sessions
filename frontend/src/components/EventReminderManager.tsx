import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  api,
  type EventNotificationDeliveryRecord,
  type EventNotificationTemplateRecord,
  type EventReminderKind,
} from '../api/client';

const LABELS: Record<EventReminderKind, string> = {
  EVENT_REMINDER_24H: '24 hours before',
  EVENT_REMINDER_1H: '1 hour before',
};

const TOKENS = [
  '{{event_title}}',
  '{{attendee_name}}',
  '{{event_time}}',
  '{{event_timezone}}',
];

function TemplateEditor({
  eventId,
  template,
}: {
  eventId: string;
  template: EventNotificationTemplateRecord;
}) {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(template.enabled);
  const [subject, setSubject] = useState(template.subject);
  const [bodyText, setBodyText] = useState(template.bodyText);

  useEffect(() => {
    setEnabled(template.enabled);
    setSubject(template.subject);
    setBodyText(template.bodyText);
  }, [template]);

  const save = useMutation({
    mutationFn: () =>
      api.updateEventNotificationTemplate(
        eventId,
        template.kind,
        template.version,
        { enabled, subject, bodyText },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['event-reminder-templates', eventId],
      });
    },
  });

  const dirty =
    enabled !== template.enabled ||
    subject !== template.subject ||
    bodyText !== template.bodyText;

  return (
    <article className="event-reminder-template-card">
      <div className="event-reminder-template-heading">
        <div>
          <strong>{LABELS[template.kind]}</strong>
          <small>
            Version {template.version} · pending deliveries automatically use the
            latest saved template.
          </small>
        </div>
        <label className="settings-toggle-row compact">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          <span>
            <strong>{enabled ? 'Enabled' : 'Disabled'}</strong>
          </span>
        </label>
      </div>

      <label>
        Email subject
        <input
          maxLength={240}
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
        />
      </label>

      <label>
        Email body
        <textarea
          maxLength={10000}
          value={bodyText}
          onChange={(event) => setBodyText(event.target.value)}
        />
      </label>

      <div className="event-reminder-template-tokens">
        <span>Variables</span>
        {TOKENS.map((token) => (
          <code key={token}>{token}</code>
        ))}
      </div>

      {save.error ? <div className="error-banner">{save.error.message}</div> : null}
      <button
        className="button secondary"
        type="button"
        disabled={
          save.isPending || !dirty || !subject.trim() || !bodyText.trim()
        }
        onClick={() => save.mutate()}
      >
        {save.isPending ? 'Saving…' : 'Save reminder'}
      </button>
    </article>
  );
}

function DeliveryRow({
  delivery,
  onRetry,
  retrying,
}: {
  delivery: EventNotificationDeliveryRecord;
  onRetry: (deliveryId: string) => void;
  retrying: boolean;
}) {
  const retryable =
    delivery.status === 'FAILED' || delivery.status === 'DEAD_LETTER';

  return (
    <tr>
      <td>
        <strong>{delivery.eventRegistration.name}</strong>
        <small>{delivery.recipientEmail}</small>
      </td>
      <td>{LABELS[delivery.kind]}</td>
      <td>
        <span className={'status-badge status-' + delivery.status.toLowerCase()}>
          {delivery.status.toLowerCase().replace('_', ' ')}
        </span>
      </td>
      <td>{new Date(delivery.scheduledFor).toLocaleString()}</td>
      <td>{delivery.attempts}</td>
      <td>
        {delivery.lastError ? (
          <small className="event-reminder-error">{delivery.lastError}</small>
        ) : delivery.deliveredAt ? (
          <small>{new Date(delivery.deliveredAt).toLocaleString()}</small>
        ) : (
          <small>—</small>
        )}
      </td>
      <td>
        {retryable ? (
          <button
            className="settings-row-action"
            type="button"
            disabled={retrying}
            onClick={() => onRetry(delivery.id)}
          >
            Retry
          </button>
        ) : null}
      </td>
    </tr>
  );
}

export function EventReminderManager({
  eventId,
  onClose,
}: {
  eventId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const templates = useQuery({
    queryKey: ['event-reminder-templates', eventId],
    queryFn: () => api.listEventNotificationTemplates(eventId),
  });
  const deliveries = useQuery({
    queryKey: ['event-reminder-deliveries', eventId],
    queryFn: () => api.listEventNotificationDeliveries(eventId),
  });

  const retry = useMutation({
    mutationFn: (deliveryId: string) =>
      api.retryEventNotificationDelivery(deliveryId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['event-reminder-deliveries', eventId],
      });
    },
  });

  const deliverySummary = useMemo(() => {
    const rows = deliveries.data ?? [];
    return {
      total: rows.length,
      delivered: rows.filter((row) => row.status === 'DELIVERED').length,
      failed: rows.filter(
        (row) => row.status === 'FAILED' || row.status === 'DEAD_LETTER',
      ).length,
    };
  }, [deliveries.data]);

  return (
    <section className="event-reminder-manager">
      <div className="event-reminder-manager-heading">
        <div>
          <span className="eyebrow">Event notifications</span>
          <h3>Registration reminders</h3>
          <p>
            Configure the 24-hour and 1-hour attendee emails. Deliveries are
            materialized durably, retried with backoff, cancelled after event or
            registration changes, and retained for reconciliation.
          </p>
        </div>
        <button className="button secondary" type="button" onClick={onClose}>
          Close
        </button>
      </div>

      {templates.isLoading ? (
        <div className="empty-panel">Loading reminder templates…</div>
      ) : null}
      {templates.error ? (
        <div className="error-banner">{templates.error.message}</div>
      ) : null}

      <div className="event-reminder-template-grid">
        {templates.data?.map((template) => (
          <TemplateEditor
            key={template.id}
            eventId={eventId}
            template={template}
          />
        ))}
      </div>

      <div className="event-reminder-delivery-heading">
        <div>
          <strong>Delivery reconciliation</strong>
          <small>
            {deliverySummary.total} total · {deliverySummary.delivered} delivered ·{' '}
            {deliverySummary.failed} need attention
          </small>
        </div>
        <button
          className="settings-row-action"
          type="button"
          onClick={() => deliveries.refetch()}
          disabled={deliveries.isFetching}
        >
          Refresh
        </button>
      </div>

      {deliveries.error ? (
        <div className="error-banner">{deliveries.error.message}</div>
      ) : null}
      {retry.error ? <div className="error-banner">{retry.error.message}</div> : null}

      {deliveries.data?.length ? (
        <div className="event-reminder-delivery-table-wrap">
          <table className="event-reminder-delivery-table">
            <thead>
              <tr>
                <th>Attendee</th>
                <th>Reminder</th>
                <th>Status</th>
                <th>Scheduled</th>
                <th>Attempts</th>
                <th>Result</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {deliveries.data.map((delivery) => (
                <DeliveryRow
                  key={delivery.id}
                  delivery={delivery}
                  retrying={retry.isPending}
                  onRetry={(deliveryId) => retry.mutate(deliveryId)}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="dynamic-form-empty">
          No event reminder deliveries have been materialized yet. They are created
          as registered attendees enter the 26-hour reminder horizon.
        </div>
      )}
    </section>
  );
}
