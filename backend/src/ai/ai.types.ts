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

export interface AgendaDraftItem {
  title: string;
  durationSeconds: number;
  type:
    | 'TEXT'
    | 'PRESENTATION'
    | 'WEBSITE'
    | 'VIDEO'
    | 'POLL'
    | 'WHITEBOARD'
    | 'BREAKOUT'
    | 'QA'
    | 'SCREEN_SHARE';
  content: Record<string, unknown>;
  rationale?: string;
}

export interface AgendaDraftRequest {
  title: string;
  description?: string;
  objective?: string;
  audience?: string;
  durationMinutes: number;
}

export interface AgendaDraftResult {
  provider: string;
  model: string;
  items: AgendaDraftItem[];
}

export interface AgendaAiProvider {
  readonly name: string;
  generateAgenda(request: AgendaDraftRequest): Promise<AgendaDraftResult>;
}

export interface FollowUpDraftRequest {
  title: string;
  summary: string;
  decisions: AiDecision[];
  actionItems: AiActionItem[];
  audience?: string;
}

export interface FollowUpDraftResult {
  provider: string;
  model: string;
  subject: string;
  body: string;
}

export interface FollowUpAiProvider {
  readonly name: string;
  draftFollowUp(request: FollowUpDraftRequest): Promise<FollowUpDraftResult>;
}
