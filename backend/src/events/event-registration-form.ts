import { BadRequestException } from '@nestjs/common';
import type {
  EventRegistrationFieldDto,
  EventRegistrationFieldType,
} from './dto/event-registration-field.dto';

export interface NormalizedEventRegistrationField {
  key: string;
  label: string;
  type: EventRegistrationFieldType;
  required: boolean;
  placeholder?: string;
  options?: string[];
}

const RESERVED_KEYS = new Set(['name', 'email']);

export function normalizeRegistrationFields(
  input: EventRegistrationFieldDto[],
): NormalizedEventRegistrationField[] {
  if (input.length > 50) {
    throw new BadRequestException('A registration form can contain at most 50 custom fields');
  }

  const seen = new Set<string>();
  return input.map((field, index) => {
    const key = field.key.trim();
    if (RESERVED_KEYS.has(key)) {
      throw new BadRequestException(
        `Registration field ${index + 1} uses reserved key "${key}"`,
      );
    }
    if (seen.has(key)) {
      throw new BadRequestException(
        `Registration field key "${key}" must be unique`,
      );
    }
    seen.add(key);

    const options = field.options
      ?.map((option) => option.trim())
      .filter(Boolean);

    if (field.type === 'SELECT' && (!options || options.length === 0)) {
      throw new BadRequestException(
        `Registration field "${key}" requires at least one option`,
      );
    }
    if (field.type !== 'SELECT' && options?.length) {
      throw new BadRequestException(
        `Registration field "${key}" does not support options`,
      );
    }

    return {
      key,
      label: field.label.trim(),
      type: field.type,
      required: Boolean(field.required),
      ...(field.placeholder?.trim()
        ? { placeholder: field.placeholder.trim() }
        : {}),
      ...(field.type === 'SELECT' ? { options: [...new Set(options)] } : {}),
    };
  });
}

export function normalizeRegistrationAnswers(
  fields: NormalizedEventRegistrationField[],
  answers: Record<string, unknown>,
): Record<string, string | boolean> {
  const allowed = new Map(fields.map((field) => [field.key, field]));
  for (const key of Object.keys(answers)) {
    if (!allowed.has(key)) {
      throw new BadRequestException(
        `Unknown registration answer key "${key}"`,
      );
    }
  }

  const normalized: Record<string, string | boolean> = {};
  for (const field of fields) {
    const value = answers[field.key];
    const missing =
      value === undefined ||
      value === null ||
      (typeof value === 'string' && value.trim() === '');

    if (field.required && missing) {
      throw new BadRequestException(
        `Registration field "${field.label}" is required`,
      );
    }
    if (missing) continue;

    if (field.type === 'CHECKBOX' || field.type === 'CONSENT') {
      if (typeof value !== 'boolean') {
        throw new BadRequestException(
          `Registration field "${field.label}" must be true or false`,
        );
      }
      if (field.type === 'CONSENT' && field.required && value !== true) {
        throw new BadRequestException(
          `Registration consent "${field.label}" must be accepted`,
        );
      }
      normalized[field.key] = value;
      continue;
    }

    if (typeof value !== 'string') {
      throw new BadRequestException(
        `Registration field "${field.label}" must be text`,
      );
    }
    const text = value.trim();
    if (text.length > 5000) {
      throw new BadRequestException(
        `Registration field "${field.label}" is too long`,
      );
    }
    if (field.type === 'EMAIL' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
      throw new BadRequestException(
        `Registration field "${field.label}" must be a valid email address`,
      );
    }
    if (
      field.type === 'SELECT' &&
      !(field.options ?? []).includes(text)
    ) {
      throw new BadRequestException(
        `Registration field "${field.label}" contains an invalid option`,
      );
    }
    normalized[field.key] = text;
  }

  return normalized;
}
