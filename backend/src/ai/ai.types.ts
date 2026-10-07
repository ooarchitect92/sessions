import type { AgendaItemType } from '@prisma/client';

export interface MeetingSummaryRequest {
  title: string;
  transcript: string;
}

export interface MeetingSummaryResult {
  provider: string;
  model?: string | null;
  summaryText: string;
  decisions: Array<{ text: string }>;
  actionItems: Array<{
    text: string;
    owner?: string | null;
    dueDate?: string | null;
  }>;
  citations: Array<{
    quote: string;
    startMs?: number | null;
    endMs?: number | null;
  }>;
}

export interface AgendaDraftRequest {
  title: string;
  description?: string | null;
  durationMinutes: number;
  prompt?: string | null;
}

export interface AgendaDraftItem {
  title: string;
  durationSeconds: number;
  type: AgendaItemType;
  content: Record<string, unknown>;
}

export interface AgendaDraftResult {
  provider: string;
  model?: string | null;
  items: AgendaDraftItem[];
}
