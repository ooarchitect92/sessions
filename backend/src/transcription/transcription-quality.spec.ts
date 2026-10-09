import { describe, expect, it } from 'vitest';
import { summarizeTranscriptionQuality } from './transcription-quality';

describe('summarizeTranscriptionQuality', () => {
  it('recognizes fully diarized speaker-labeled segments', () => {
    const result = summarizeTranscriptionQuality([
      { startMs: 0, endMs: 1000, speakerLabel: 'Speaker 1', text: 'Hello' },
      { startMs: 1000, endMs: 2100, speakerLabel: 'Speaker 2', text: 'Hi' },
    ]);

    expect(result.diarized).toBe(true);
    expect(result.speakerCount).toBe(2);
    expect(result.labeledSegmentRatio).toBe(1);
    expect(result.orderedTimestamps).toBe(true);
  });

  it('detects missing labels and overlapping segments', () => {
    const result = summarizeTranscriptionQuality([
      { startMs: 0, endMs: 1500, speakerLabel: null, text: 'One' },
      { startMs: 1000, endMs: 2000, speakerLabel: 'Speaker 2', text: 'Two' },
    ]);

    expect(result.diarized).toBe(false);
    expect(result.labeledSegmentRatio).toBe(0.5);
    expect(result.overlappingSegmentCount).toBe(1);
  });
});
