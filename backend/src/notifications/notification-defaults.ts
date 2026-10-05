import { NotificationKind } from '@prisma/client';

export interface NotificationTemplateDefinition {
  subjectTemplate: string;
  textTemplate: string;
  htmlTemplate: string;
}

export const DEFAULT_NOTIFICATION_TEMPLATES: Record<
  NotificationKind,
  NotificationTemplateDefinition
> = {
  BOOKING_CONFIRMATION: {
    subjectTemplate: 'Booking confirmed: {{title}}',
    textTemplate:
      'Hi {{name}},\n\nYour booking for {{title}} is confirmed for {{startsAt}} ({{timezone}}).\n\nManage or reschedule: {{manageUrl}}\n\nThanks,\n{{workspaceName}}',
    htmlTemplate:
      '<p>Hi {{name}},</p><p>Your booking for <strong>{{title}}</strong> is confirmed for <strong>{{startsAt}}</strong> ({{timezone}}).</p><p><a href="{{manageUrl}}">Manage or reschedule your booking</a></p><p>Thanks,<br>{{workspaceName}}</p>',
  },
  BOOKING_REMINDER_24H: {
    subjectTemplate: 'Reminder: {{title}} is tomorrow',
    textTemplate:
      'Hi {{name}},\n\nThis is a reminder that {{title}} starts at {{startsAt}} ({{timezone}}).\n\nManage booking: {{manageUrl}}\n\n{{workspaceName}}',
    htmlTemplate:
      '<p>Hi {{name}},</p><p>This is a reminder that <strong>{{title}}</strong> starts at <strong>{{startsAt}}</strong> ({{timezone}}).</p><p><a href="{{manageUrl}}">Manage booking</a></p><p>{{workspaceName}}</p>',
  },
  BOOKING_REMINDER_1H: {
    subjectTemplate: 'Starting soon: {{title}}',
    textTemplate:
      'Hi {{name}},\n\n{{title}} starts in about one hour at {{startsAt}} ({{timezone}}).\n\nManage booking: {{manageUrl}}\n\n{{workspaceName}}',
    htmlTemplate:
      '<p>Hi {{name}},</p><p><strong>{{title}}</strong> starts in about one hour at <strong>{{startsAt}}</strong> ({{timezone}}).</p><p><a href="{{manageUrl}}">Manage booking</a></p><p>{{workspaceName}}</p>',
  },
  EVENT_REGISTRATION_CONFIRMATION: {
    subjectTemplate: 'Registration {{status}}: {{title}}',
    textTemplate:
      'Hi {{name}},\n\nYour registration for {{title}} is {{status}}. The event starts at {{startsAt}} ({{timezone}}).\n\nEvent page: {{eventUrl}}\n\n{{workspaceName}}',
    htmlTemplate:
      '<p>Hi {{name}},</p><p>Your registration for <strong>{{title}}</strong> is <strong>{{status}}</strong>.</p><p>The event starts at <strong>{{startsAt}}</strong> ({{timezone}}).</p><p><a href="{{eventUrl}}">View event page</a></p><p>{{workspaceName}}</p>',
  },
  EVENT_REMINDER_24H: {
    subjectTemplate: 'Reminder: {{title}} is tomorrow',
    textTemplate:
      'Hi {{name}},\n\n{{title}} starts at {{startsAt}} ({{timezone}}).\n\nEvent page: {{eventUrl}}\n\n{{workspaceName}}',
    htmlTemplate:
      '<p>Hi {{name}},</p><p><strong>{{title}}</strong> starts at <strong>{{startsAt}}</strong> ({{timezone}}).</p><p><a href="{{eventUrl}}">View event page</a></p><p>{{workspaceName}}</p>',
  },
  EVENT_REMINDER_1H: {
    subjectTemplate: 'Starting soon: {{title}}',
    textTemplate:
      'Hi {{name}},\n\n{{title}} starts in about one hour at {{startsAt}} ({{timezone}}).\n\nEvent page: {{eventUrl}}\n\n{{workspaceName}}',
    htmlTemplate:
      '<p>Hi {{name}},</p><p><strong>{{title}}</strong> starts in about one hour at <strong>{{startsAt}}</strong> ({{timezone}}).</p><p><a href="{{eventUrl}}">View event page</a></p><p>{{workspaceName}}</p>',
  },
};

const TOKEN_PATTERN = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function renderNotificationTemplate(
  template: NotificationTemplateDefinition,
  variables: Record<string, string>,
): NotificationTemplateDefinition {
  const replace = (value: string, html: boolean) =>
    value.replace(TOKEN_PATTERN, (_match, key: string) => {
      const replacement = variables[key] ?? '';
      return html ? escapeHtml(replacement) : replacement;
    });

  return {
    subjectTemplate: replace(template.subjectTemplate, false)
      .replace(/[\r\n]+/g, ' ')
      .slice(0, 300),
    textTemplate: replace(template.textTemplate, false),
    htmlTemplate: replace(template.htmlTemplate, true),
  };
}
