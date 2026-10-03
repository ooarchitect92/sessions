export interface TranscriptionSource {
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
  languageHint?: string | null;
}

export interface TranscriptionSegmentResult {
  startMs: number;
  endMs: number;
  text: string;
  speakerLabel?: string | null;
}

export interface TranscriptionResult {
  provider: string;
  language?: string | null;
  fullText: string;
  segments: TranscriptionSegmentResult[];
}

export abstract class TranscriptionProvider {
  abstract readonly name: string;
  abstract transcribe(source: TranscriptionSource): Promise<TranscriptionResult>;
}

export function normalizeSegments(
  text: string,
  rawSegments: Array<{
    start?: number;
    end?: number;
    text?: string;
    speaker?: string | null;
  }> = [],
): TranscriptionSegmentResult[] {
  const cleaned = rawSegments
    .map((segment) => ({
      startMs: Math.max(0, Math.round((segment.start ?? 0) * 1000)),
      endMs: Math.max(0, Math.round((segment.end ?? segment.start ?? 0) * 1000)),
      text: (segment.text ?? '').trim(),
      speakerLabel: segment.speaker?.trim() || null,
    }))
    .filter((segment) => segment.text.length > 0)
    .map((segment) => ({
      ...segment,
      endMs: Math.max(segment.endMs, segment.startMs),
    }));

  if (cleaned.length > 0) return cleaned;

  const fallback = text.trim();
  return fallback
    ? [{ startMs: 0, endMs: 0, text: fallback, speakerLabel: null }]
    : [];
}
