import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface OpenAiEmbeddingResponse {
  data?: Array<{
    index?: number;
    embedding?: number[];
  }>;
  model?: string;
}

export interface EmbeddingBatchResult {
  provider: string;
  model: string;
  vectors: number[][];
}

@Injectable()
export class EmbeddingProviderService {
  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    return this.providerName() !== 'disabled';
  }

  providerName(): string {
    return this.config.get<string>('EMBEDDING_PROVIDER', 'disabled');
  }

  dimensions(): number {
    return this.config.get<number>('EMBEDDING_DIMENSIONS', 1536);
  }

  modelName(): string {
    const provider = this.providerName();
    if (provider === 'mock') return 'deterministic-hash-1536';
    return this.config.get<string>(
      'EMBEDDING_OPENAI_MODEL',
      'text-embedding-3-small',
    );
  }

  async embed(texts: string[]): Promise<EmbeddingBatchResult> {
    if (texts.length === 0) {
      return {
        provider: this.providerName(),
        model: this.modelName(),
        vectors: [],
      };
    }

    const provider = this.providerName();
    if (provider === 'mock') {
      return {
        provider,
        model: this.modelName(),
        vectors: texts.map((text) => this.mockEmbedding(text)),
      };
    }
    if (provider === 'openai') return this.openAiEmbeddings(texts);
    throw new Error('embedding_provider_disabled');
  }

  private mockEmbedding(text: string): number[] {
    const dimensions = this.dimensions();
    const vector = Array.from({ length: dimensions }, () => 0);
    const tokens =
      text
        .toLocaleLowerCase()
        .match(/[\p{L}\p{N}_-]+/gu)
        ?.slice(0, 4000) ?? [];

    for (const token of tokens) {
      const digest = createHash('sha256').update(token).digest();
      const bucket = digest.readUInt32BE(0) % dimensions;
      const sign = (digest[4] ?? 0) % 2 === 0 ? 1 : -1;
      vector[bucket] = (vector[bucket] ?? 0) + sign;
    }

    const magnitude = Math.sqrt(
      vector.reduce((sum, value) => sum + value * value, 0),
    );
    if (magnitude === 0) {
      vector[0] = 1;
      return vector;
    }
    return vector.map((value) => value / magnitude);
  }

  private async openAiEmbeddings(
    texts: string[],
  ): Promise<EmbeddingBatchResult> {
    const apiKey = this.config.getOrThrow<string>('EMBEDDING_OPENAI_API_KEY');
    const endpoint = this.config.get<string>(
      'EMBEDDING_OPENAI_ENDPOINT',
      'https://api.openai.com/v1/embeddings',
    );
    const model = this.config.get<string>(
      'EMBEDDING_OPENAI_MODEL',
      'text-embedding-3-small',
    );
    const dimensions = this.dimensions();

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: texts,
        dimensions,
        encoding_format: 'float',
      }),
    });
    if (!response.ok) {
      throw new Error(`embedding_provider_http_${response.status}`);
    }

    const payload = (await response.json()) as OpenAiEmbeddingResponse;
    if (!Array.isArray(payload.data) || payload.data.length !== texts.length) {
      throw new Error('embedding_provider_invalid_response');
    }

    const ordered = [...payload.data].sort(
      (left, right) => (left.index ?? 0) - (right.index ?? 0),
    );
    const vectors = ordered.map((entry) => {
      if (
        !Array.isArray(entry.embedding) ||
        entry.embedding.length !== dimensions ||
        entry.embedding.some((value) => !Number.isFinite(value))
      ) {
        throw new Error('embedding_provider_invalid_vector');
      }
      return entry.embedding;
    });

    return {
      provider: 'openai',
      model: payload.model ?? model,
      vectors,
    };
  }
}
