import { describe, expect, it } from 'vitest';
import { normalizeSegments } from './transcription-provider';

describe('normalizeSegments', () => {
  it('converts provider seconds into ordered millisecond segments', () => {
    expect(
      normalizeSegments('hello world', [
        { start: 0.25, end: 1.5, text: ' hello ', speaker: ' Speaker 1 ' },
      ]),
    ).toEqual([
      {
        startMs: 250,
        endMs: 1500,
        text: 'hello',
        speakerLabel: 'Speaker 1',
      },
    ]);
  });

  it('falls back to a single segment when a provider returns only text', () => {
    expect(normalizeSegments('  transcript body  ')).toEqual([
      {
        startMs: 0,
        endMs: 0,
        text: 'transcript body',
        speakerLabel: null,
      },
    ]);
  });
});
