import { describe, expect, it } from 'vitest';
import {
  memorySummaryReviewError,
  normalizeMemorySummaryReview,
} from './memory-summary-review';

describe('memory summary review normalization', () => {
  it('trims reviewed content and drops empty decisions', () => {
    expect(
      normalizeMemorySummaryReview({
        summaryText: '  Launch readiness discussed.  ',
        decisions: [' Ship Monday ', '   '],
        actionItems: [
          { title: ' Prepare checklist ', owner: ' Asha ', dueDate: ' 2026-10-05 ' },
        ],
        reviewNote: ' Verified with team ',
      }),
    ).toEqual({
      summaryText: 'Launch readiness discussed.',
      decisions: ['Ship Monday'],
      actionItems: [
        {
          title: 'Prepare checklist',
          owner: 'Asha',
          dueDate: '2026-10-05',
        },
      ],
      reviewNote: 'Verified with team',
    });
  });

  it('rejects an empty reviewed summary', () => {
    const normalized = normalizeMemorySummaryReview({
      summaryText: ' ',
      decisions: [],
      actionItems: [],
    });
    expect(memorySummaryReviewError(normalized)).toBe(
      'Summary text cannot be empty',
    );
  });
});
