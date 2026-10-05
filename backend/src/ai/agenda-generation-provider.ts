import { AgendaItemType } from '@prisma/client';

export interface AgendaGenerationInput {
  sessionTitle: string;
  sessionDescription?: string | null;
  durationMinutes: number;
  objective: string;
  desiredItems: number;
}

export interface AgendaSuggestion {
  title: string;
  durationSeconds: number;
  type: AgendaItemType;
  notes: string;
}

export interface AgendaGenerationResult {
  provider: string;
  model: string;
  items: AgendaSuggestion[];
}

const SAFE_TYPES = new Set<AgendaItemType>([
  AgendaItemType.TEXT,
  AgendaItemType.POLL,
  AgendaItemType.QA,
  AgendaItemType.BREAKOUT,
]);

export abstract class AgendaGenerationProvider {
  abstract readonly name: string;
  abstract generate(input: AgendaGenerationInput): Promise<AgendaGenerationResult>;
}

export function normalizeAgendaSuggestions(
  value: unknown,
  durationMinutes: number,
  desiredItems: number,
): AgendaSuggestion[] {
  if (!value || typeof value !== 'object') return [];
  const object = value as Record<string, unknown>;
  if (!Array.isArray(object.items)) return [];

  const maxDurationSeconds = Math.max(300, durationMinutes * 60);
  const items: AgendaSuggestion[] = [];

  for (const raw of object.items.slice(0, Math.max(1, Math.min(desiredItems, 12)))) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Record<string, unknown>;
    const title = typeof entry.title === 'string' ? entry.title.trim() : '';
    if (!title) continue;

    const requestedMinutes = Number(entry.durationMinutes);
    const durationSeconds = Math.max(
      60,
      Math.min(
        maxDurationSeconds,
        Number.isFinite(requestedMinutes)
          ? Math.round(requestedMinutes * 60)
          : Math.max(300, Math.floor(maxDurationSeconds / desiredItems)),
      ),
    );

    const rawType =
      typeof entry.type === 'string'
        ? (entry.type.trim().toUpperCase() as AgendaItemType)
        : AgendaItemType.TEXT;
    const type = SAFE_TYPES.has(rawType) ? rawType : AgendaItemType.TEXT;

    items.push({
      title: title.slice(0, 160),
      durationSeconds,
      type,
      notes:
        typeof entry.notes === 'string' && entry.notes.trim()
          ? entry.notes.trim().slice(0, 2000)
          : '',
    });
  }

  if (items.length === 0) return items;

  const total = items.reduce((sum, item) => sum + item.durationSeconds, 0);
  if (total <= maxDurationSeconds) return items;

  const ratio = maxDurationSeconds / total;
  return items.map((item) => ({
    ...item,
    durationSeconds: Math.max(60, Math.floor(item.durationSeconds * ratio)),
  }));
}
