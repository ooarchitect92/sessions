import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { EmbeddingProviderService } from './embedding-provider.service';

describe('EmbeddingProviderService', () => {
  it('creates deterministic normalized mock vectors with the configured dimension', async () => {
    const config = new ConfigService({
      EMBEDDING_PROVIDER: 'mock',
      EMBEDDING_DIMENSIONS: 1536,
    });
    const provider = new EmbeddingProviderService(config);

    const first = await provider.embed(['enterprise pricing discussion']);
    const second = await provider.embed(['enterprise pricing discussion']);

    expect(first.vectors).toEqual(second.vectors);
    expect(first.vectors[0]).toHaveLength(1536);
    const magnitude = Math.sqrt(
      first.vectors[0]!.reduce((sum, value) => sum + value * value, 0),
    );
    expect(magnitude).toBeCloseTo(1, 8);
  });

  it('returns vectors in input order', async () => {
    const provider = new EmbeddingProviderService(
      new ConfigService({
        EMBEDDING_PROVIDER: 'mock',
        EMBEDDING_DIMENSIONS: 1536,
      }),
    );
    const result = await provider.embed(['alpha', 'beta']);
    expect(result.vectors).toHaveLength(2);
    expect(result.vectors[0]).not.toEqual(result.vectors[1]);
  });
});
