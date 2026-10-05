import { AgendaItemType } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  normalizeAgendaContent,
  normalizeExternalUrl,
} from './agenda-content';

describe('agenda content normalization', () => {
  it('requires HTTPS for embeddable agenda content', () => {
    expect(() => normalizeExternalUrl('http://example.com/demo')).toThrow(
      'Agenda content URL must use HTTPS',
    );
  });

  it('normalizes embeddable URLs', () => {
    expect(
      normalizeAgendaContent(AgendaItemType.WEBSITE, {
        url: 'https://example.com/demo',
      }),
    ).toEqual({ url: 'https://example.com/demo' });
  });

  it('trims text content', () => {
    expect(
      normalizeAgendaContent(AgendaItemType.TEXT, {
        text: '  review the launch plan  ',
      }),
    ).toEqual({ text: 'review the launch plan' });
  });
});
