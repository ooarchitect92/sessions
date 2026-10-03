import type { UpdateMemorySummaryDto } from './dto/update-memory-summary.dto';

export interface NormalizedMemoryActionItem {
  title: string;
  owner: string | null;
  dueDate: string | null;
}

export interface NormalizedMemorySummaryReview {
  summaryText: string;
  decisions: string[];
  actionItems: NormalizedMemoryActionItem[];
  reviewNote: string | null;
}

export function normalizeMemorySummaryReview(
  input: UpdateMemorySummaryDto,
): NormalizedMemorySummaryReview {
  return {
    summaryText: input.summaryText.trim(),
    decisions: input.decisions
      .map((decision) => decision.trim())
      .filter(Boolean)
      .slice(0, 100),
    actionItems: input.actionItems
      .map((item) => ({
        title: item.title.trim(),
        owner: item.owner?.trim() || null,
        dueDate: item.dueDate?.trim() || null,
      }))
      .filter((item) => item.title.length > 0)
      .slice(0, 100),
    reviewNote: input.reviewNote?.trim() || null,
  };
}

export function memorySummaryReviewError(
  value: NormalizedMemorySummaryReview,
): string | null {
  if (!value.summaryText) return 'Summary text cannot be empty';
  if (value.actionItems.some((item) => !item.title)) {
    return 'Action item titles cannot be empty';
  }
  return null;
}
