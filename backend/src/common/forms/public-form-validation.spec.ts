import { describe, expect, it } from 'vitest';
import {
  assertPublicFormFields,
  validatePublicFormAnswers,
} from './public-form-validation';
import type { PublicFormFieldDto } from './public-form-field.dto';

const fields: PublicFormFieldDto[] = [
  {
    key: 'company',
    label: 'Company',
    type: 'TEXT',
    required: true,
    options: [],
  },
  {
    key: 'role',
    label: 'Role',
    type: 'SELECT',
    required: false,
    options: ['Founder', 'Engineer'],
  },
  {
    key: 'consent',
    label: 'I agree to be contacted',
    type: 'CONSENT',
    required: true,
    options: [],
  },
];

describe('public form validation', () => {
  it('normalizes supported answers and preserves booleans', () => {
    expect(
      validatePublicFormAnswers(fields, {
        company: '  Acme  ',
        role: 'Engineer',
        consent: true,
      }),
    ).toEqual({
      company: 'Acme',
      role: 'Engineer',
      consent: true,
    });
  });

  it('rejects missing required answers', () => {
    expect(() =>
      validatePublicFormAnswers(fields, {
        role: 'Engineer',
        consent: true,
      }),
    ).toThrow('Company is required');
  });

  it('rejects unknown and invalid select values', () => {
    expect(() =>
      validatePublicFormAnswers(fields, {
        company: 'Acme',
        consent: true,
        hidden: 'value',
      }),
    ).toThrow('Unknown form field');

    expect(() =>
      validatePublicFormAnswers(fields, {
        company: 'Acme',
        role: 'Other',
        consent: true,
      }),
    ).toThrow('Role has an invalid selection');
  });

  it('rejects duplicate field keys and invalid select definitions', () => {
    expect(() => assertPublicFormFields([...fields, fields[0]!])).toThrow(
      'Duplicate form field key',
    );

    expect(() =>
      assertPublicFormFields([
        {
          key: 'empty_select',
          label: 'Empty select',
          type: 'SELECT',
          required: false,
          options: [],
        },
      ]),
    ).toThrow('must include at least one option');
  });
});
