import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { TranscriptionProviderService } from './transcription-provider.service';

describe('TranscriptionProviderService', () => {
  it('provides a deterministic local mock pipeline', async () => {
    const service = new TranscriptionProviderService(
      new ConfigService({ STT_PROVIDER: 'mock' }),
    );

    const result = await service.transcribe({
      media: Buffer.from('local-media'),
      mimeType: 'audio/wav',
      filename: 'sample.wav',
      language: 'en',
    });

    expect(result.provider).toBe('mock');
    expect(result.language).toBe('en');
    expect(result.fullText.length).toBeGreaterThan(0);
    expect(result.segments).toHaveLength(1);
  });

  it('accepts speaker-labeled segments from the controlled HTTP adapter', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          provider: 'diarization-test',
          language: 'en',
          fullText: 'Hello there. Welcome back.',
          segments: [
            {
              startMs: 0,
              endMs: 800,
              speakerLabel: 'Speaker 1',
              text: 'Hello there.',
            },
            {
              startMs: 800,
              endMs: 1600,
              speakerLabel: 'Speaker 2',
              text: 'Welcome back.',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    try {
      const service = new TranscriptionProviderService(
        new ConfigService({
          STT_PROVIDER: 'http',
          STT_HTTP_ENDPOINT: 'https://stt.example.test/transcribe',
          STT_HTTP_API_KEY: 'test-key',
        }),
      );
      const result = await service.transcribe({
        media: Buffer.from('media'),
        mimeType: 'audio/wav',
        filename: 'sample.wav',
      });
      expect(result.provider).toBe('http:diarization-test');
      expect(result.segments.map((segment) => segment.speakerLabel)).toEqual([
        'Speaker 1',
        'Speaker 2',
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
