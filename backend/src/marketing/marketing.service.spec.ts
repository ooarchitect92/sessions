import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { MarketingService } from './marketing.service';

const baseInput = {
  submissionKey: '44444444-4444-4444-8444-444444444444',
  kind: 'DEMO' as const,
  name: 'Alex',
  email: 'ALEX@EXAMPLE.COM',
  consent: true,
  metadata: {},
};

function createService(overrides?: {
  create?: ReturnType<typeof vi.fn>;
  outboxCreate?: ReturnType<typeof vi.fn>;
  findUnique?: ReturnType<typeof vi.fn>;
  incr?: ReturnType<typeof vi.fn>;
}) {
  const create =
    overrides?.create ??
    vi.fn().mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      kind: 'DEMO',
      createdAt: new Date('2026-10-08T00:00:00.000Z'),
    });
  const outboxCreate = overrides?.outboxCreate ?? vi.fn().mockResolvedValue({ id: 'event-id' });
  const findUnique = overrides?.findUnique ?? vi.fn();
  const incr = overrides?.incr ?? vi.fn().mockResolvedValue(1);
  const transactionClient = {
    marketingLead: { create },
    marketingLeadOutboxEvent: { create: outboxCreate },
  };
  const prisma = {
    marketingLead: { findUnique },
    $transaction: vi.fn(async (callback: (transaction: typeof transactionClient) => unknown) =>
      callback(transactionClient),
    ),
  };
  const redis = { incr, expire: vi.fn().mockResolvedValue(1) };
  const config = { getOrThrow: vi.fn().mockReturnValue('x'.repeat(32)) };
  return {
    service: new MarketingService(prisma as never, redis as never, config as never),
    create,
    outboxCreate,
    findUnique,
    incr,
  };
}

describe('MarketingService', () => {
  it('persists a consented public lead and one durable outbox event before acknowledging it', async () => {
    const { service, create, outboxCreate } = createService();

    await expect(service.createLead(baseInput, '127.0.0.1')).resolves.toMatchObject({
      kind: 'DEMO',
      status: 'RECEIVED',
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          submissionKey: baseInput.submissionKey,
          name: 'Alex',
          email: 'alex@example.com',
          consent: true,
          requestHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      }),
    );
    expect(outboxCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          leadId: '11111111-1111-4111-8111-111111111111',
          eventType: 'marketing.lead.received',
        }),
      }),
    );
  });

  it('rejects requests without consent', async () => {
    const { service } = createService();
    await expect(service.createLead({ ...baseInput, consent: false })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects honeypot submissions', async () => {
    const { service } = createService();
    const { name: _name, ...newsletterInput } = baseInput;
    await expect(
      service.createLead({ ...newsletterInput, kind: 'NEWSLETTER', website: 'spam' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rate limits repeated public submissions without storing raw IP addresses', async () => {
    const { service } = createService({ incr: vi.fn().mockResolvedValue(9) });
    try {
      await service.createLead(baseInput, '203.0.113.9');
      throw new Error('expected rate limit');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    }
  });

  it('returns the same accepted lead for an idempotent retry without creating another outbox event', async () => {
    const create = vi.fn().mockRejectedValue({ code: 'P2002' });
    const outboxCreate = vi.fn();
    const nodeCrypto = await import('node:crypto');
    const normalized = {
      kind: 'DEMO',
      name: 'Alex',
      email: 'alex@example.com',
      company: null,
      teamSize: null,
      message: null,
      sourcePath: null,
      consent: true,
      metadata: {},
    };
    const requestHash = nodeCrypto
      .createHash('sha256')
      .update(JSON.stringify(normalized))
      .digest('hex');
    const findUnique = vi.fn().mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      kind: 'DEMO',
      createdAt: new Date('2026-10-08T00:00:00.000Z'),
      requestHash,
    });
    const { service } = createService({ create, outboxCreate, findUnique });

    await expect(
      service.createLead({ ...baseInput, email: 'alex@example.com' }),
    ).resolves.toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      status: 'RECEIVED',
    });
    expect(outboxCreate).not.toHaveBeenCalled();
  });

  it('rejects a reused submission key when the payload is different', async () => {
    const { service } = createService({
      create: vi.fn().mockRejectedValue({ code: 'P2002' }),
      findUnique: vi.fn().mockResolvedValue({
        id: '11111111-1111-4111-8111-111111111111',
        kind: 'DEMO',
        createdAt: new Date('2026-10-08T00:00:00.000Z'),
        requestHash: 'different',
      }),
    });
    await expect(service.createLead(baseInput)).rejects.toBeInstanceOf(ConflictException);
  });
});
