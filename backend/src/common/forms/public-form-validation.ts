import { BadRequestException } from '@nestjs/common';
import type { PublicFormFieldDto } from './public-form-field.dto';

export function assertPublicFormFields(fields: PublicFormFieldDto[]): void {
  const seen = new Set<string>();
  for (const field of fields) {
    const key = field.key.trim();
    if (seen.has(key)) {
      throw new BadRequestException(`Duplicate form field key: ${key}`);
    }
    seen.add(key);

    const options = field.options.map((option) => option.trim()).filter(Boolean);
    if (field.type === 'SELECT') {
      if (options.length === 0) {
        throw new BadRequestException(
          `Select field "${field.label}" must include at least one option`,
        );
      }
      if (new Set(options).size !== options.length) {
        throw new BadRequestException(
          `Select field "${field.label}" contains duplicate options`,
        );
      }
    } else if (options.length > 0) {
      throw new BadRequestException(
        `Only select fields may define options (${field.label})`,
      );
    }
  }
}

export function validatePublicFormAnswers(
  fields: PublicFormFieldDto[],
  answers: Record<string, unknown>,
): Record<string, string | boolean> {
  assertPublicFormFields(fields);
  const allowedKeys = new Set(fields.map((field) => field.key));
  for (const key of Object.keys(answers)) {
    if (!allowedKeys.has(key)) {
      throw new BadRequestException(`Unknown form field: ${key}`);
    }
  }

  const normalized: Record<string, string | boolean> = {};
  for (const field of fields) {
    const value = answers[field.key];

    if (field.type === 'CHECKBOX' || field.type === 'CONSENT') {
      if (value === undefined || value === null) {
        if (field.required) {
          throw new BadRequestException(`${field.label} is required`);
        }
        normalized[field.key] = false;
        continue;
      }
      if (typeof value !== 'boolean') {
        throw new BadRequestException(`${field.label} must be true or false`);
      }
      if (field.required && value !== true) {
        throw new BadRequestException(`${field.label} must be accepted`);
      }
      normalized[field.key] = value;
      continue;
    }

    if (value === undefined || value === null || value === '') {
      if (field.required) {
        throw new BadRequestException(`${field.label} is required`);
      }
      continue;
    }
    if (typeof value !== 'string') {
      throw new BadRequestException(`${field.label} must be text`);
    }
    const text = value.trim();
    if (field.required && text.length === 0) {
      throw new BadRequestException(`${field.label} is required`);
    }
    if (text.length > 5000) {
      throw new BadRequestException(`${field.label} exceeds the 5000 character limit`);
    }
    if (field.type === 'SELECT' && !field.options.includes(text)) {
      throw new BadRequestException(`${field.label} has an invalid selection`);
    }
    normalized[field.key] = text;
  }

  return normalized;
}
