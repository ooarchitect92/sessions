import { BadRequestException } from '@nestjs/common';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export const DYNAMIC_FORM_FIELD_TYPES = [
  'TEXT',
  'TEXTAREA',
  'SELECT',
  'MULTI_SELECT',
  'CHECKBOX',
  'NUMBER',
  'CONSENT',
] as const;

export type DynamicFormFieldType = (typeof DYNAMIC_FORM_FIELD_TYPES)[number];

export class DynamicFormFieldDto {
  @IsString()
  @Length(1, 80)
  @Matches(/^[a-z][a-z0-9_]*$/)
  key!: string;

  @IsString()
  @Length(1, 160)
  label!: string;

  @IsIn(DYNAMIC_FORM_FIELD_TYPES)
  type!: DynamicFormFieldType;

  @IsOptional()
  @IsBoolean()
  required = false;

  @IsOptional()
  @IsString()
  @Length(0, 240)
  placeholder?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  options?: string[];
}

export interface DynamicFormField {
  key: string;
  label: string;
  type: DynamicFormFieldType;
  required?: boolean;
  placeholder?: string;
  options?: string[];
}

export function assertDynamicFormDefinition(
  fields: DynamicFormField[],
  maxFields = 50,
): void {
  if (fields.length > maxFields) {
    throw new BadRequestException(
      `Dynamic forms support at most ${maxFields} fields`,
    );
  }
  const seen = new Set<string>();
  for (const field of fields) {
    if (seen.has(field.key)) {
      throw new BadRequestException(
        `Dynamic form field key "${field.key}" is duplicated`,
      );
    }
    seen.add(field.key);

    if (field.type === 'SELECT' || field.type === 'MULTI_SELECT') {
      const options = (field.options ?? [])
        .map((option) => option.trim())
        .filter(Boolean);
      if (options.length < 1) {
        throw new BadRequestException(
          `Field "${field.key}" requires at least one option`,
        );
      }
      if (new Set(options).size !== options.length) {
        throw new BadRequestException(
          `Field "${field.key}" contains duplicate options`,
        );
      }
    } else if (field.options?.length) {
      throw new BadRequestException(
        `Field "${field.key}" does not support options`,
      );
    }
  }
}

export function validateDynamicFormAnswers(
  fields: DynamicFormField[],
  answers: Record<string, unknown>,
): Record<string, unknown> {
  const definitions = new Map(fields.map((field) => [field.key, field]));
  for (const key of Object.keys(answers)) {
    if (!definitions.has(key)) {
      throw new BadRequestException(
        `Unexpected form answer "${key}"`,
      );
    }
  }

  const normalized: Record<string, unknown> = {};
  for (const field of fields) {
    const value = answers[field.key];
    const missing =
      value === undefined ||
      value === null ||
      (typeof value === 'string' && value.trim() === '') ||
      (Array.isArray(value) && value.length === 0);

    if (missing) {
      if (field.required) {
        throw new BadRequestException(
          `Field "${field.label}" is required`,
        );
      }
      continue;
    }

    switch (field.type) {
      case 'TEXT':
      case 'TEXTAREA': {
        if (typeof value !== 'string') {
          throw new BadRequestException(
            `Field "${field.label}" must be text`,
          );
        }
        const trimmed = value.trim();
        const max = field.type === 'TEXT' ? 500 : 5000;
        if (trimmed.length > max) {
          throw new BadRequestException(
            `Field "${field.label}" exceeds ${max} characters`,
          );
        }
        normalized[field.key] = trimmed;
        break;
      }
      case 'NUMBER': {
        const number =
          typeof value === 'number'
            ? value
            : typeof value === 'string' && value.trim()
              ? Number(value)
              : Number.NaN;
        if (!Number.isFinite(number)) {
          throw new BadRequestException(
            `Field "${field.label}" must be a number`,
          );
        }
        normalized[field.key] = number;
        break;
      }
      case 'CHECKBOX': {
        if (typeof value !== 'boolean') {
          throw new BadRequestException(
            `Field "${field.label}" must be true or false`,
          );
        }
        normalized[field.key] = value;
        break;
      }
      case 'CONSENT': {
        if (value !== true) {
          throw new BadRequestException(
            `Consent field "${field.label}" must be accepted`,
          );
        }
        normalized[field.key] = true;
        break;
      }
      case 'SELECT': {
        if (
          typeof value !== 'string' ||
          !(field.options ?? []).includes(value)
        ) {
          throw new BadRequestException(
            `Field "${field.label}" contains an invalid option`,
          );
        }
        normalized[field.key] = value;
        break;
      }
      case 'MULTI_SELECT': {
        if (
          !Array.isArray(value) ||
          value.some(
            (item) =>
              typeof item !== 'string' ||
              !(field.options ?? []).includes(item),
          )
        ) {
          throw new BadRequestException(
            `Field "${field.label}" contains invalid options`,
          );
        }
        normalized[field.key] = [...new Set(value)];
        break;
      }
    }
  }
  return normalized;
}
