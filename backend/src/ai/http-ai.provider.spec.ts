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

  it('normalizes a bounded agenda draft', () => {
    const result = provider.normalizeAgenda(
      {
        model: 'agenda-model',
        items: [
          {
            title: 'Welcome',
            durationSeconds: 300,
            type: 'TEXT',
            content: {},
            rationale: 'Set context',
          },
          {
            title: 'Demo',
            durationSeconds: 900,
            type: 'SCREEN_SHARE',
            content: {},
          },
          {
            title: 'Invalid',
            durationSeconds: 1,
            type: 'TEXT',
          },
        ],
      },
      'fallback',
      30,
    );

    expect(result.model).toBe('agenda-model');
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      title: 'Welcome',
      durationSeconds: 300,
      type: 'TEXT',
    });
  });

  it('rejects responses without a summary', () => {
    expect(() => provider.normalize({}, 'model', 2)).toThrow(
      'AI provider response did not contain a summary',
    );
  });

  it('rejects agenda responses without valid items', () => {
    expect(() => provider.normalizeAgenda({ items: [] }, 'model', 30)).toThrow(
      'AI provider response did not contain valid agenda items',
    );
  });
});
