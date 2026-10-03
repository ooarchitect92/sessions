import { AgendaItemType } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { normalizeAgendaSuggestions } from './agenda-generation-provider';

describe('normalizeAgendaSuggestions', () => {
  it('keeps supported types and bounds generated values', () => {
    const items = normalizeAgendaSuggestions(
      {
        items: [
          {
            title: ' Opening ',
            durationMinutes: 5,
            type: 'TEXT',
            notes: ' Set context ',
          },
          {
            title: 'Decide',
            durationMinutes: 15,
            type: 'UNKNOWN',
            notes: '',
          },
        ],
      },
      30,
      5,
    );

    expect(items).toEqual([
      {
        title: 'Opening',
        durationSeconds: 300,
        type: AgendaItemType.TEXT,
        notes: 'Set context',
      },
      {
        title: 'Decide',
        durationSeconds: 900,
        type: AgendaItemType.TEXT,
        notes: '',
      },
    ]);
  });

  it('scales suggestions to fit the meeting duration', () => {
    const items = normalizeAgendaSuggestions(
      {
        items: [
          { title: 'One', durationMinutes: 40, type: 'TEXT' },
          { title: 'Two', durationMinutes: 40, type: 'QA' },
        ],
      },
      30,
      2,
    );

    expect(items.reduce((sum, item) => sum + item.durationSeconds, 0)).toBeLessThanOrEqual(
      30 * 60,
    );
  });
});
