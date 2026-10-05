import { describe, expect, it } from 'vitest';
import { NotificationKind } from '@prisma/client';
import {
  DEFAULT_NOTIFICATION_TEMPLATES,
  renderNotificationTemplate,
} from './notification-defaults';

describe('notification template rendering', () => {
  it('replaces variables and escapes HTML values', () => {
    const rendered = renderNotificationTemplate(
      DEFAULT_NOTIFICATION_TEMPLATES[NotificationKind.BOOKING_CONFIRMATION],
      {
        name: '<Avery>',
        title: 'Demo',
        startsAt: '10:00',
        timezone: 'UTC',
        manageUrl: 'https://example.test/manage?a=1&b=2',
        workspaceName: 'Sales',
        organizationName: 'Acme',
      },
    );
    expect(rendered.subjectTemplate).toContain('Demo');
    expect(rendered.textTemplate).toContain('<Avery>');
    expect(rendered.htmlTemplate).toContain('&lt;Avery&gt;');
    expect(rendered.htmlTemplate).toContain('&amp;');
  });

  it('removes unknown variables and subject newlines', () => {
    const rendered = renderNotificationTemplate(
      {
        subjectTemplate: 'Hello\n{{missing}}',
        textTemplate: '{{missing}}',
        htmlTemplate: '{{missing}}',
      },
      {},
    );
    expect(rendered.subjectTemplate).toBe('Hello ');
    expect(rendered.textTemplate).toBe('');
    expect(rendered.htmlTemplate).toBe('');
  });
});
