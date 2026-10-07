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
