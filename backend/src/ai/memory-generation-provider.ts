export interface MemoryCitation {
  segmentPosition: number;
  startMs: number;
  endMs: number;
  reason: string | null;
}

export interface MemoryActionItem {
  title: string;
  owner: string | null;
  dueDate: string | null;
}

export interface MemoryGenerationInput {
  sessionTitle: string;
  transcriptText: string;
  transcriptSegments: Array<{
    position: number;
    startMs: number;
    endMs: number;
    speakerLabel?: string | null;
    text: string;
  }>;
}

export interface MemoryGenerationResult {
  provider: string;
  model: string;
  summaryText: string;
  decisions: string[];
  actionItems: MemoryActionItem[];
  citations: MemoryCitation[];
}

export abstract class MemoryGenerationProvider {
  abstract readonly name: string;
  abstract generate(input: MemoryGenerationInput): Promise<MemoryGenerationResult>;
}

export function normalizeMemoryGeneration(
  value: unknown,
): Omit<MemoryGenerationResult, 'provider' | 'model'> {
  const fallback = {
    summaryText: '',
    decisions: [] as string[],
    actionItems: [] as MemoryActionItem[],
    citations: [] as MemoryCitation[],
  };

  if (!value || typeof value !== 'object') return fallback;
  const object = value as Record<string, unknown>;

  const summaryText =
    typeof object.summaryText === 'string' ? object.summaryText.trim() : '';

  const decisions = Array.isArray(object.decisions)
    ? object.decisions
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 50)
    : [];

  const actionItems = Array.isArray(object.actionItems)
    ? object.actionItems
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const entry = item as Record<string, unknown>;
          if (typeof entry.title !== 'string' || !entry.title.trim()) return null;
          return {
            title: entry.title.trim().slice(0, 500),
            owner:
              typeof entry.owner === 'string' && entry.owner.trim()
                ? entry.owner.trim().slice(0, 160)
                : null,
            dueDate:
              typeof entry.dueDate === 'string' && entry.dueDate.trim()
                ? entry.dueDate.trim().slice(0, 64)
                : null,
          };
        })
        .filter((item): item is MemoryActionItem => Boolean(item))
        .slice(0, 50)
    : [];

  const citations = Array.isArray(object.citations)
    ? object.citations
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const entry = item as Record<string, unknown>;
          const segmentPosition = Number(entry.segmentPosition);
          const startMs = Number(entry.startMs);
          const endMs = Number(entry.endMs);
          if (
            !Number.isInteger(segmentPosition) ||
            !Number.isFinite(startMs) ||
            !Number.isFinite(endMs)
          ) {
            return null;
          }
          return {
            segmentPosition,
            startMs: Math.max(0, Math.round(startMs)),
            endMs: Math.max(0, Math.round(endMs)),
            reason:
              typeof entry.reason === 'string' && entry.reason.trim()
                ? entry.reason.trim().slice(0, 500)
                : null,
          };
        })
        .filter((item): item is MemoryCitation => Boolean(item))
        .slice(0, 100)
    : [];

  return { summaryText, decisions, actionItems, citations };
}
