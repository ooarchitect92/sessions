import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { HttpTranscriptionProvider } from './http-transcription.provider';

describe('HttpTranscriptionProvider', () => {
  const provider = new HttpTranscriptionProvider(new ConfigService());

  it('normalizes second-based provider segments into milliseconds', () => {
    const result = provider.normalize({
      text: 'Hello world',
      language: 'en',
      segments: [
        { start: 0.25, end: 1.5, speaker: 'Speaker 1', text: 'Hello world' },
      ],
    });

    expect(result.text).toBe('Hello world');
    expect(result.language).toBe('en');
    expect(result.segments).toEqual([
      {
        startMs: 250,
        endMs: 1500,
        speakerLabel: 'Speaker 1',
        text: 'Hello world',
      },
    ]);
  });

  it('falls back to one segment when only full text is returned', () => {
    const result = provider.normalize({ text: 'Standalone transcript' });

    expect(result.segments).toEqual([
      { startMs: 0, endMs: 0, text: 'Standalone transcript' },
    ]);
  });

  it('rejects empty provider responses', () => {
    expect(() => provider.normalize({})).toThrow(
      'STT provider response did not contain transcript text',
    );
  });
});
