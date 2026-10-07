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
});
