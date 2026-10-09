import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { MediaNormalizationService } from './media-normalization.service';

describe('MediaNormalizationService', () => {
  it('returns original media unchanged when normalization is disabled', async () => {
    const service = new MediaNormalizationService(
      new ConfigService({ STT_MEDIA_NORMALIZATION: 'disabled' }),
    );
    const media = Buffer.from('raw-media');

    const result = await service.normalize({
      media,
      mimeType: 'video/mp4',
      filename: 'session.mp4',
    });

    expect(result.media).toBe(media);
    expect(result.mimeType).toBe('video/mp4');
    expect(result.filename).toBe('session.mp4');
    expect(result.normalized).toBe(false);
  });
});
