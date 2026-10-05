export interface AiCitation {
  segmentPosition: number;
  quote?: string;
}

export interface AiDecision {
  text: string;
  citations: AiCitation[];
}

export interface AiActionItem {
  text: string;
  owner?: string;
  dueDate?: string;
  citations: AiCitation[];
}

export interface MeetingSummaryResult {
  provider: string;
  model: string;
  summary: string;
  decisions: AiDecision[];
  actionItems: AiActionItem[];
  citations: AiCitation[];
}

export interface MeetingSummaryRequest {
  title: string;
  description?: string;
  transcript: string;
  segments: Array<{
    position: number;
    startMs: number;
    endMs: number;
    speakerLabel?: string;
    text: string;
  }>;
  agenda: Array<{
    position: number;
    title: string;
  }>;
}

export interface MeetingAiProvider {
  readonly name: string;
  summarize(request: MeetingSummaryRequest): Promise<MeetingSummaryResult>;
}
