import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  normalizeRegistrationAnswers,
  normalizeRegistrationFields,
} from './event-registration-form';

describe('event registration form', () => {
  it('normalizes fields and answers', () => {
    const fields = normalizeRegistrationFields([
      {
        key: 'company',
        label: ' Company ',
        type: 'TEXT',
        required: true,
        placeholder: ' Your company ',
      },
      {
        key: 'role',
        label: 'Role',
        type: 'SELECT',
        required: false,
        options: ['Founder', ' CTO ', 'Founder'],
      },
      {
        key: 'terms',
        label: 'Accept terms',
        type: 'CONSENT',
        required: true,
      },
    ]);

    expect(fields).toEqual([
      {
        key: 'company',
        label: 'Company',
        type: 'TEXT',
        required: true,
        placeholder: 'Your company',
      },
      {
        key: 'role',
        label: 'Role',
        type: 'SELECT',
        required: false,
        options: ['Founder', 'CTO'],
      },
      {
        key: 'terms',
        label: 'Accept terms',
        type: 'CONSENT',
        required: true,
      },
    ]);

    expect(
      normalizeRegistrationAnswers(fields, {
        company: '  Acme  ',
        role: 'CTO',
        terms: true,
      }),
    ).toEqual({
      company: 'Acme',
      role: 'CTO',
      terms: true,
    });
  });

  it('rejects duplicate or invalid form definitions', () => {
    expect(() =>
      normalizeRegistrationFields([
        { key: 'name', label: 'Name', type: 'TEXT', required: false },
      ]),
    ).toThrow(BadRequestException);

    expect(() =>
      normalizeRegistrationFields([
        { key: 'role', label: 'Role', type: 'SELECT', required: false },
      ]),
    ).toThrow(BadRequestException);
  });

  it('enforces required answers, consent, and select options', () => {
    const fields = normalizeRegistrationFields([
      {
        key: 'role',
        label: 'Role',
        type: 'SELECT',
        required: true,
        options: ['Founder'],
      },
      {
        key: 'terms',
        label: 'Terms',
        type: 'CONSENT',
        required: true,
      },
    ]);

    expect(() =>
      normalizeRegistrationAnswers(fields, { role: 'Founder', terms: false }),
    ).toThrow('must be accepted');
    expect(() =>
      normalizeRegistrationAnswers(fields, { role: 'Other', terms: true }),
    ).toThrow('invalid option');
    expect(() =>
      normalizeRegistrationAnswers(fields, { terms: true }),
    ).toThrow('is required');
  });
});
