import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { MarketingService } from './marketing.service';

describe('MarketingService', () => {
  it('persists a consented public lead before acknowledging it', async () => {
    const create = vi.fn().mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      kind: 'DEMO',
      createdAt: new Date('2026-10-08T00:00:00.000Z'),
    });
    const service = new MarketingService({ marketingLead: { create } } as never);

    await expect(service.createLead({
      kind: 'DEMO',
      name: 'Alex',
      email: 'ALEX@EXAMPLE.COM',
      consent: true,
      metadata: {},
    })).resolves.toMatchObject({ kind: 'DEMO', status: 'RECEIVED' });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        name: 'Alex',
        email: 'alex@example.com',
        consent: true,
      }),
    }));
  });

  it('rejects requests without consent', async () => {
    const service = new MarketingService({ marketingLead: { create: vi.fn() } } as never);
    await expect(service.createLead({
      kind: 'CONTACT',
      name: 'Alex',
      email: 'alex@example.com',
      consent: false,
      metadata: {},
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects honeypot submissions', async () => {
    const service = new MarketingService({ marketingLead: { create: vi.fn() } } as never);
    await expect(service.createLead({
      kind: 'NEWSLETTER',
      email: 'bot@example.com',
      consent: true,
      website: 'https://spam.invalid',
      metadata: {},
    })).rejects.toBeInstanceOf(BadRequestException);
  });
});
