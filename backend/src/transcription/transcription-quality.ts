import type { TranscriptionSegmentResult } from './transcription.types';

export interface TranscriptionQualitySummary {
  diarized: boolean;
  speakerCount: number;
  labeledSegmentRatio: number;
  orderedTimestamps: boolean;
  overlappingSegmentCount: number;
}

export function summarizeTranscriptionQuality(
  segments: TranscriptionSegmentResult[],
): TranscriptionQualitySummary {
  const labels = new Set(
    segments
      .map((segment) => segment.speakerLabel?.trim())
      .filter((value): value is string => Boolean(value)),
  );
  const labeled = segments.filter((segment) => Boolean(segment.speakerLabel?.trim())).length;
  let orderedTimestamps = true;
  let overlappingSegmentCount = 0;

  for (let index = 0; index < segments.length; index += 1) {
    const current = segments[index]!;
    if (current.endMs < current.startMs) orderedTimestamps = false;
    const previous = index > 0 ? segments[index - 1] : undefined;
    if (previous && current.startMs < previous.startMs) orderedTimestamps = false;
    if (previous && current.startMs < previous.endMs) overlappingSegmentCount += 1;
  }

  return {
    diarized: segments.length > 0 && labeled === segments.length,
    speakerCount: labels.size,
    labeledSegmentRatio: segments.length === 0 ? 0 : labeled / segments.length,
    orderedTimestamps,
    overlappingSegmentCount,
  };
}
