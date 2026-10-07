export interface TranscriptionSegmentResult {
  startMs: number;
  endMs: number;
  speakerLabel?: string | null;
  text: string;
}

export interface TranscriptionResult {
  provider: string;
  language?: string | null;
  fullText: string;
  segments: TranscriptionSegmentResult[];
}

export interface TranscriptionRequest {
  media: Buffer;
  mimeType: string;
  filename: string;
  language?: string | null;
}
