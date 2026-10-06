import { describe, expect, it } from 'vitest';
import {
  normalizeWorkspaceEmailTemplates,
  renderEmailTemplate,
} from './workspace-email-templates';

describe('workspace email templates', () => {
  it('normalizes configured templates and renders placeholders plus signature', () => {
    const config = normalizeWorkspaceEmailTemplates({
      signature: 'Regards,\n{{brand_name}}',
      templates: {
        BOOKING_CONFIRMATION: {
          subject: '{{brand_name}} · {{title}} confirmed',
          body: 'Hi {{name}},\n{{status_message}}\nStarts: {{starts_at}}',
        },
      },
    });

    expect(
      renderEmailTemplate(
        config,
        'BOOKING_CONFIRMATION',
        { subject: 'default', body: 'default' },
        {
          brand_name: 'Acme',
          title: 'Discovery',
          name: 'Ada',
          status_message: 'Your booking is confirmed.',
          starts_at: 'Tuesday 10:00',
        },
      ),
    ).toEqual({
      subject: 'Acme · Discovery confirmed',
      body:
        'Hi Ada,\nYour booking is confirmed.\nStarts: Tuesday 10:00\n\nRegards,\nAcme',
    });
  });

  it('rejects unsupported purposes and placeholders', () => {
    expect(() =>
      normalizeWorkspaceEmailTemplates({
        templates: {
          UNKNOWN: { subject: 'x', body: 'y' },
        },
      }),
    ).toThrow('Unsupported email template purpose');

    expect(() =>
      normalizeWorkspaceEmailTemplates({
        templates: {
          EVENT_CONFIRMATION: {
            subject: '{{unknown_value}}',
            body: 'Hello',
          },
        },
      }),
    ).toThrow('unsupported placeholder');
  });

  it('uses defaults when no override exists', () => {
    const config = normalizeWorkspaceEmailTemplates(null);
    expect(
      renderEmailTemplate(
        config,
        'EVENT_REMINDER_1H',
        {
          subject: 'Reminder: {{title}}',
          body: 'Hi {{name}}',
        },
        { title: 'Summit', name: 'Grace' },
      ),
    ).toEqual({
      subject: 'Reminder: Summit',
      body: 'Hi Grace',
    });
  });
});
