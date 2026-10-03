import type { UpdateTranscriptSegmentDto } from './dto/update-transcript.dto';

export interface NormalizedTranscriptSegment {
  position: number;
  startMs: number;
  endMs: number;
  speakerLabel: string | null;
  text: string;
}

export function normalizeTranscriptCorrection(
  segments: UpdateTranscriptSegmentDto[],
): NormalizedTranscriptSegment[] {
  return [...segments]
    .sort((left, right) => left.position - right.position)
    .map((segment, position) => ({
      position,
      startMs: segment.startMs,
      endMs: segment.endMs,
      speakerLabel: segment.speakerLabel?.trim() || null,
      text: segment.text.trim(),
    }));
}

export function transcriptCorrectionError(
  segments: NormalizedTranscriptSegment[],
): string | null {
  for (const segment of segments) {
    if (segment.endMs < segment.startMs) {
      return `Transcript segment ${segment.position} ends before it starts`;
    }
    if (!segment.text) {
      return `Transcript segment ${segment.position} cannot be empty`;
    }
  }
  return null;
}
