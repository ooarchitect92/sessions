import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { HttpAiProvider } from './http-ai.provider';

describe('HttpAiProvider', () => {
  const provider = new HttpAiProvider(new ConfigService());

  it('normalizes grounded summary output and filters invalid citations', () => {
    const result = provider.normalize(
      {
        model: 'summary-model',
        summary: 'The team agreed to ship the release.',
        decisions: [
          {
            text: 'Ship the release Friday',
            citations: [
              { segmentPosition: 1, quote: 'ship Friday' },
              { segmentPosition: 99 },
            ],
          },
        ],
        actionItems: [
          {
            text: 'Prepare release notes',
            owner: 'Avery',
            citations: [{ segmentPosition: 2 }],
          },
        ],
        citations: [{ segmentPosition: 1 }, { segmentPosition: 1 }],
      },
      'fallback',
      3,
    );

    expect(result.model).toBe('summary-model');
    expect(result.decisions[0]?.citations).toEqual([
      { segmentPosition: 1, quote: 'ship Friday' },
    ]);
    expect(result.actionItems[0]).toMatchObject({
      text: 'Prepare release notes',
      owner: 'Avery',
    });
    expect(result.citations).toEqual([{ segmentPosition: 1 }]);
  });

  it('rejects responses without a summary', () => {
    expect(() => provider.normalize({}, 'model', 2)).toThrow(
      'AI provider response did not contain a summary',
    );
  });
});
