import { BadRequestException } from '@nestjs/common';
import { WorkspaceEmailTemplateKind } from '@prisma/client';

const VARIABLE_PATTERN = /{{\s*([a-z_]+)\s*}}/g;

export const WORKSPACE_EMAIL_VARIABLES: Record<
  WorkspaceEmailTemplateKind,
  readonly string[]
> = {
  BOOKING_REMINDER_24H: [
    'attendee_name',
    'booking_title',
    'booking_time',
    'booking_timezone',
    'workspace_name',
  ],
  BOOKING_REMINDER_1H: [
    'attendee_name',
    'booking_title',
    'booking_time',
    'booking_timezone',
    'workspace_name',
  ],
  EVENT_REMINDER_24H: [
    'attendee_name',
    'event_title',
    'event_time',
    'event_timezone',
    'workspace_name',
  ],
  EVENT_REMINDER_1H: [
    'attendee_name',
    'event_title',
    'event_time',
    'event_timezone',
    'workspace_name',
  ],
};

export function assertWorkspaceEmailTemplate(
  kind: WorkspaceEmailTemplateKind,
  subject: string,
  bodyText: string,
  signatureText?: string | null,
): void {
  if (!subject.trim() || !bodyText.trim()) {
    throw new BadRequestException('Email template subject and body cannot be empty');
  }
  const allowed = new Set(WORKSPACE_EMAIL_VARIABLES[kind]);
  for (const source of [subject, bodyText, signatureText ?? '']) {
    for (const match of source.matchAll(VARIABLE_PATTERN)) {
      const key = match[1];
      if (!key || !allowed.has(key)) {
        throw new BadRequestException(
          `Unknown variable "{{${key ?? ''}}}" for ${kind}`,
        );
      }
    }
    const withoutKnown = source.replace(VARIABLE_PATTERN, '');
    if (withoutKnown.includes('{{') || withoutKnown.includes('}}')) {
      throw new BadRequestException(
        'Email template variables must use {{variable_name}} syntax',
      );
    }
  }
}

export function renderWorkspaceEmailTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(VARIABLE_PATTERN, (_match, key: string) => {
    if (!(key in variables)) throw new Error(`unknown_workspace_email_variable:${key}`);
    return variables[key] ?? '';
  });
}

export const DEFAULT_WORKSPACE_EMAIL_TEMPLATES = {
  BOOKING_REMINDER_24H: {
    subject: 'Reminder: {{booking_title}} starts tomorrow',
    bodyText:
      'Hi {{attendee_name}},\n\n{{booking_title}} starts in 24 hours.\n\nTime: {{booking_time}} ({{booking_timezone}})',
  },
  BOOKING_REMINDER_1H: {
    subject: 'Reminder: {{booking_title}} starts in 1 hour',
    bodyText:
      'Hi {{attendee_name}},\n\n{{booking_title}} starts in 1 hour.\n\nTime: {{booking_time}} ({{booking_timezone}})',
  },
  EVENT_REMINDER_24H: {
    subject: 'Reminder: {{event_title}} starts tomorrow',
    bodyText:
      'Hi {{attendee_name}},\n\n{{event_title}} starts in 24 hours.\n\nTime: {{event_time}} ({{event_timezone}})',
  },
  EVENT_REMINDER_1H: {
    subject: 'Reminder: {{event_title}} starts in 1 hour',
    bodyText:
      'Hi {{attendee_name}},\n\n{{event_title}} starts in 1 hour.\n\nTime: {{event_time}} ({{event_timezone}})',
  },
} as const;
