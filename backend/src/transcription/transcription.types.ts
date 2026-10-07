export interface TranscriptSegmentResult {
  startMs: number;
  endMs: number;
  speakerLabel?: string;
  text: string;
}

export interface TranscriptionResult {
  language?: string;
  text: string;
  segments: TranscriptSegmentResult[];
  provider: string;
}

export interface TranscriptionRequest {
  audio: Buffer;
  filename: string;
  mimeType: string;
  language?: string;
}

export interface TranscriptionProvider {
  readonly name: string;
  transcribe(request: TranscriptionRequest): Promise<TranscriptionResult>;
}
