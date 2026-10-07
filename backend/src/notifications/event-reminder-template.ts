import { BadRequestException } from '@nestjs/common';

export const EVENT_REMINDER_VARIABLES = [
  'event_title',
  'attendee_name',
  'event_time',
  'event_timezone',
] as const;

export type EventReminderVariables = Record<
  (typeof EVENT_REMINDER_VARIABLES)[number],
  string
>;

const VARIABLE_PATTERN = /{{\s*([a-z_]+)\s*}}/g;

export function assertEventReminderTemplate(
  subject: string,
  bodyText: string,
): void {
  if (!subject.trim() || !bodyText.trim()) {
    throw new BadRequestException(
      'Event reminder subject and body cannot be empty',
    );
  }

  for (const source of [subject, bodyText]) {
    const matches = source.matchAll(VARIABLE_PATTERN);
    for (const match of matches) {
      const key = match[1];
      if (
        !EVENT_REMINDER_VARIABLES.includes(
          key as (typeof EVENT_REMINDER_VARIABLES)[number],
        )
      ) {
        throw new BadRequestException(
          `Unknown event reminder variable "{{${key}}}"`,
        );
      }
    }

    const withoutKnown = source.replace(VARIABLE_PATTERN, '');
    if (withoutKnown.includes('{{') || withoutKnown.includes('}}')) {
      throw new BadRequestException(
        'Event reminder variables must use {{variable_name}} syntax',
      );
    }
  }
}

export function renderEventReminderTemplate(
  template: string,
  variables: EventReminderVariables,
): string {
  return template.replace(VARIABLE_PATTERN, (_match, key: string) => {
    if (!(key in variables)) {
      throw new Error(`unknown_event_reminder_variable:${key}`);
    }
    return variables[key as keyof EventReminderVariables];
  });
}
