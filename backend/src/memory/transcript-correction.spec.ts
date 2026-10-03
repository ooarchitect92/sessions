import { describe, expect, it } from 'vitest';
import {
  normalizeTranscriptCorrection,
  transcriptCorrectionError,
} from './transcript-correction';

describe('transcript correction normalization', () => {
  it('sorts and reindexes segments while trimming reviewable fields', () => {
    expect(
      normalizeTranscriptCorrection([
        {
          position: 9,
          startMs: 1000,
          endMs: 2000,
          speakerLabel: ' Speaker B ',
          text: ' second ',
        },
        {
          position: 2,
          startMs: 0,
          endMs: 900,
          speakerLabel: null,
          text: ' first ',
        },
      ]),
    ).toEqual([
      {
        position: 0,
        startMs: 0,
        endMs: 900,
        speakerLabel: null,
        text: 'first',
      },
      {
        position: 1,
        startMs: 1000,
        endMs: 2000,
        speakerLabel: 'Speaker B',
        text: 'second',
      },
    ]);
  });

  it('rejects invalid time ranges and empty text', () => {
    expect(
      transcriptCorrectionError([
        {
          position: 0,
          startMs: 2000,
          endMs: 1000,
          speakerLabel: null,
          text: 'bad range',
        },
      ]),
    ).toContain('ends before');

    expect(
      transcriptCorrectionError([
        {
          position: 0,
          startMs: 0,
          endMs: 1000,
          speakerLabel: null,
          text: '',
        },
      ]),
    ).toContain('cannot be empty');
  });
});
