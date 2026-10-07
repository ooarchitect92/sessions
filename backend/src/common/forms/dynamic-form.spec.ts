import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  assertDynamicFormDefinition,
  validateDynamicFormAnswers,
  type DynamicFormField,
} from './dynamic-form';

const fields: DynamicFormField[] = [
  {
    key: 'company',
    label: 'Company',
    type: 'TEXT',
    required: true,
  },
  {
    key: 'team_size',
    label: 'Team size',
    type: 'NUMBER',
  },
  {
    key: 'topics',
    label: 'Topics',
    type: 'MULTI_SELECT',
    options: ['Sales', 'Support'],
  },
  {
    key: 'consent',
    label: 'I agree to the event policy',
    type: 'CONSENT',
    required: true,
  },
];

describe('dynamic form definitions', () => {
  it('accepts a valid typed field definition', () => {
    expect(() => assertDynamicFormDefinition(fields)).not.toThrow();
  });

  it('rejects duplicate stable keys', () => {
    expect(() =>
      assertDynamicFormDefinition([
        fields[0]!,
        { ...fields[0]!, label: 'Duplicate' },
      ]),
    ).toThrow(BadRequestException);
  });

  it('requires options for select fields', () => {
    expect(() =>
      assertDynamicFormDefinition([
        {
          key: 'segment',
          label: 'Segment',
          type: 'SELECT',
          options: [],
        },
      ]),
    ).toThrow(BadRequestException);
  });
});

describe('dynamic form answers', () => {
  it('normalizes accepted answers', () => {
    expect(
      validateDynamicFormAnswers(fields, {
        company: '  Acme  ',
        team_size: '42',
        topics: ['Sales', 'Sales'],
        consent: true,
      }),
    ).toEqual({
      company: 'Acme',
      team_size: 42,
      topics: ['Sales'],
      consent: true,
    });
  });

  it('rejects unknown answer keys', () => {
    expect(() =>
      validateDynamicFormAnswers(fields, {
        company: 'Acme',
        consent: true,
        internal_role: 'admin',
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects missing required fields and false consent', () => {
    expect(() =>
      validateDynamicFormAnswers(fields, { consent: true }),
    ).toThrow(BadRequestException);
    expect(() =>
      validateDynamicFormAnswers(fields, {
        company: 'Acme',
        consent: false,
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects values outside configured choices', () => {
    expect(() =>
      validateDynamicFormAnswers(fields, {
        company: 'Acme',
        topics: ['Finance'],
        consent: true,
      }),
    ).toThrow(BadRequestException);
  });
});
