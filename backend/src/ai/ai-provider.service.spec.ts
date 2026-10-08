import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { AiProviderService } from './ai-provider.service';

describe('AiProviderService', () => {
  it('creates a deterministic local summary', async () => {
    const service = new AiProviderService(
      new ConfigService({ AI_PROVIDER: 'mock' }),
    );

    const result = await service.summarize({
      title: 'Weekly sync',
      transcript: 'We reviewed progress and agreed to ship the release Friday.',
    });

    expect(result.provider).toBe('mock');
    expect(result.model).toBe('deterministic-local');
    expect(result.summaryText).toContain('reviewed progress');
    expect(result.decisions).toEqual([]);
    expect(result.actionItems).toEqual([]);
  });

  it('creates a deterministic human-reviewable follow-up draft', async () => {
    const service = new AiProviderService(
      new ConfigService({ AI_PROVIDER: 'mock' }),
    );

    const result = await service.generateFollowUpDraft({
      title: 'Customer review',
      summaryText: 'The team agreed to send revised pricing next week.',
      decisions: [{ text: 'Use annual pricing.' }],
      actionItems: [{ text: 'Send revised pricing', owner: 'Sam' }],
      guidance: 'Keep it concise.',
    });

    expect(result.provider).toBe('mock');
    expect(result.emailSubject).toContain('Customer review');
    expect(result.emailBody).toContain('revised pricing');
    expect(result.crmNote).toContain('annual pricing');
  });

  it('creates a deterministic reviewable agenda draft', async () => {
    const service = new AiProviderService(
      new ConfigService({ AI_PROVIDER: 'mock' }),
    );

    const result = await service.generateAgendaDraft({
      title: 'Customer onboarding',
      description: 'Review setup, blockers and next steps',
      durationMinutes: 30,
      prompt: 'Leave time for decisions.',
    });

    expect(result.provider).toBe('mock');
    expect(result.items).toHaveLength(3);
    expect(result.items[0]?.title).toContain('Welcome');
    expect(
      result.items.reduce((total, item) => total + item.durationSeconds, 0),
    ).toBeGreaterThanOrEqual(300);
  });
});
