import { BadRequestException } from '@nestjs/common';

export const EMAIL_TEMPLATE_PURPOSES = [
  'BOOKING_CONFIRMATION',
  'BOOKING_RESCHEDULED',
  'BOOKING_CANCELLED',
  'BOOKING_REMINDER_24H',
  'BOOKING_REMINDER_1H',
  'EVENT_CONFIRMATION',
  'EVENT_WAITLIST',
  'EVENT_REMINDER_24H',
  'EVENT_REMINDER_1H',
] as const;

export type EmailTemplatePurpose = (typeof EMAIL_TEMPLATE_PURPOSES)[number];

export interface EmailTemplateDefinition {
  subject: string;
  body: string;
}

export interface WorkspaceEmailTemplates {
  signature: string;
  templates: Partial<Record<EmailTemplatePurpose, EmailTemplateDefinition>>;
}

const PURPOSE_SET = new Set<string>(EMAIL_TEMPLATE_PURPOSES);
const ALLOWED_PLACEHOLDERS = new Set([
  'name',
  'title',
  'starts_at',
  'ends_at',
  'timezone',
  'brand_name',
  'status_message',
  'join_url',
]);

const PLACEHOLDER_PATTERN = /\{\{\s*([a-z_]+)\s*\}\}/g;

function validateTemplateText(value: string, field: string, max: number): string {
  const text = value.trim();
  if (!text) throw new BadRequestException(`${field} cannot be empty`);
  if (text.length > max) {
    throw new BadRequestException(`${field} exceeds the ${max} character limit`);
  }
  for (const match of text.matchAll(PLACEHOLDER_PATTERN)) {
    const placeholder = match[1];
    if (!placeholder || !ALLOWED_PLACEHOLDERS.has(placeholder)) {
      throw new BadRequestException(
        `${field} contains unsupported placeholder: ${placeholder ?? 'unknown'}`,
      );
    }
  }
  return text;
}

export function normalizeWorkspaceEmailTemplates(value: unknown): WorkspaceEmailTemplates {
  if (value === undefined || value === null) {
    return { signature: '', templates: {} };
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('emailTemplates must be an object');
  }

  const input = value as Record<string, unknown>;
  const signature =
    input.signature === undefined || input.signature === null
      ? ''
      : typeof input.signature === 'string'
        ? input.signature.trim().slice(0, 2000)
        : (() => {
            throw new BadRequestException('emailTemplates.signature must be text');
          })();

  const rawTemplates =
    input.templates === undefined || input.templates === null
      ? {}
      : input.templates;
  if (typeof rawTemplates !== 'object' || Array.isArray(rawTemplates)) {
    throw new BadRequestException('emailTemplates.templates must be an object');
  }

  const templates: Partial<Record<EmailTemplatePurpose, EmailTemplateDefinition>> = {};
  for (const [purpose, raw] of Object.entries(rawTemplates as Record<string, unknown>)) {
    if (!PURPOSE_SET.has(purpose)) {
      throw new BadRequestException(`Unsupported email template purpose: ${purpose}`);
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new BadRequestException(`${purpose} template must be an object`);
    }
    const template = raw as Record<string, unknown>;
    if (typeof template.subject !== 'string' || typeof template.body !== 'string') {
      throw new BadRequestException(`${purpose} template requires subject and body`);
    }
    templates[purpose as EmailTemplatePurpose] = {
      subject: validateTemplateText(template.subject, `${purpose}.subject`, 240),
      body: validateTemplateText(template.body, `${purpose}.body`, 10_000),
    };
  }

  return { signature, templates };
}

export function workspaceEmailTemplates(settings: unknown): WorkspaceEmailTemplates {
  const object =
    settings && typeof settings === 'object' && !Array.isArray(settings)
      ? (settings as Record<string, unknown>)
      : {};
  try {
    return normalizeWorkspaceEmailTemplates(object.emailTemplates);
  } catch {
    return { signature: '', templates: {} };
  }
}

export function renderEmailTemplate(
  config: WorkspaceEmailTemplates,
  purpose: EmailTemplatePurpose,
  defaults: EmailTemplateDefinition,
  variables: Record<string, string>,
): EmailTemplateDefinition {
  const selected = config.templates[purpose] ?? defaults;
  const render = (source: string) =>
    source.replace(PLACEHOLDER_PATTERN, (_match, key: string) => variables[key] ?? '');

  const body = render(selected.body);
  const signature = config.signature ? render(config.signature) : '';
  return {
    subject: render(selected.subject).slice(0, 240),
    body: signature ? `${body}\n\n${signature}` : body,
  };
}
