import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { DiarizationProviderService } from './diarization-provider.service';

describe('DiarizationProviderService', () => {
  it('preserves existing labels and fills missing labels in deterministic mock mode', async () => {
    const service = new DiarizationProviderService(
      new ConfigService({ STT_DIARIZATION_PROVIDER: 'mock' }),
    );

    const result = await service.diarize({
      media: Buffer.from('media'),
      mimeType: 'audio/wav',
      filename: 'meeting.wav',
      transcription: {
        provider: 'mock',
        language: 'en',
        fullText: 'Hello world',
        segments: [
          {
            startMs: 0,
            endMs: 500,
            text: 'Hello',
            speakerLabel: 'Host',
          },
          {
            startMs: 500,
            endMs: 1000,
            text: 'world',
            speakerLabel: null,
          },
        ],
      },
    });

    expect(result.segments[0]?.speakerLabel).toBe('Host');
    expect(result.segments[1]?.speakerLabel).toBe('Speaker 1');
    expect(result.provider).toContain('diarization:mock');
  });

  it('is a no-op when diarization is disabled', async () => {
    const service = new DiarizationProviderService(
      new ConfigService({ STT_DIARIZATION_PROVIDER: 'disabled' }),
    );
    const transcription = {
      provider: 'mock',
      fullText: 'Hello',
      segments: [{ startMs: 0, endMs: 100, text: 'Hello' }],
    };

    await expect(
      service.diarize({
        media: Buffer.from('media'),
        mimeType: 'audio/wav',
        filename: 'meeting.wav',
        transcription,
      }),
    ).resolves.toEqual(transcription);
  });
});
