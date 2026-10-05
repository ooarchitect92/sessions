import { describe, expect, it } from 'vitest';
import { normalizeMemoryGeneration } from './memory-generation-provider';

describe('normalizeMemoryGeneration', () => {
  it('normalizes reviewable meeting-memory output', () => {
    expect(
      normalizeMemoryGeneration({
        summaryText: '  Discussed launch readiness. ',
        decisions: [' Ship Monday ', 123],
        actionItems: [
          { title: ' Prepare checklist ', owner: 'Asha', dueDate: '2026-10-05' },
          { title: '' },
        ],
        citations: [
          {
            segmentPosition: 3,
            startMs: 1200.2,
            endMs: 2400.8,
            reason: 'supports launch date',
          },
        ],
      }),
    ).toEqual({
      summaryText: 'Discussed launch readiness.',
      decisions: ['Ship Monday'],
      actionItems: [
        {
          title: 'Prepare checklist',
          owner: 'Asha',
          dueDate: '2026-10-05',
        },
      ],
      citations: [
        {
          segmentPosition: 3,
          startMs: 1200,
          endMs: 2401,
          reason: 'supports launch date',
        },
      ],
    });
  });

  it('returns empty reviewable fields for malformed provider output', () => {
    expect(normalizeMemoryGeneration(null)).toEqual({
      summaryText: '',
      decisions: [],
      actionItems: [],
      citations: [],
    });
  });
});
