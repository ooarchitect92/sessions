import { BadRequestException } from '@nestjs/common';
import type { WorkspaceEmailTemplateKind } from './dto/upsert-workspace-email-template.dto';

const EVENT_VARIABLES = ['event_title', 'attendee_name', 'event_time', 'event_timezone'] as const;
const BOOKING_VARIABLES = ['booking_title', 'attendee_name', 'booking_time', 'booking_timezone'] as const;
const VARIABLE_PATTERN = /{{\s*([a-z_]+)\s*}}/g;

export function assertWorkspaceEmailTemplate(kind: WorkspaceEmailTemplateKind, subject: string, bodyText: string, signature: string): void {
  const allowed = kind.startsWith('EVENT_') ? EVENT_VARIABLES : BOOKING_VARIABLES;
  if (!subject.trim() || !bodyText.trim()) throw new BadRequestException('Email template subject and body cannot be empty');
  for (const source of [subject, bodyText, signature]) {
    for (const match of source.matchAll(VARIABLE_PATTERN)) {
      const key = match[1];
      if (!key || !allowed.includes(key as never)) throw new BadRequestException(`Unknown email template variable "{{${key ?? ''}}}"`);
    }
    const withoutKnown = source.replace(VARIABLE_PATTERN, '');
    if (withoutKnown.includes('{{') || withoutKnown.includes('}}')) throw new BadRequestException('Email template variables must use {{variable_name}} syntax');
  }
}

export function renderWorkspaceEmailTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(VARIABLE_PATTERN, (_match, key: string) => variables[key] ?? '');
}