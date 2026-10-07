import {
  BadRequestException,
  ConflictException,
  TooManyRequestsException,
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
  const findUnique = overrides?.findUnique ?? vi.fn();
  const incr = overrides?.incr ?? vi.fn().mockResolvedValue(1);
  const prisma = { marketingLead: { create, findUnique } };
  const redis = { incr, expire: vi.fn().mockResolvedValue(1) };
  const config = { getOrThrow: vi.fn().mockReturnValue('x'.repeat(32)) };
  return {
    service: new MarketingService(prisma as never, redis as never, config as never),
    create,
    findUnique,
    incr,
  };
}

describe('MarketingService', () => {
  it('persists a consented public lead before acknowledging it', async () => {
    const { service, create } = createService();

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
  });

  it('rejects requests without consent', async () => {
    const { service } = createService();
    await expect(service.createLead({ ...baseInput, consent: false })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects honeypot submissions', async () => {
    const { service } = createService();
    await expect(
      service.createLead({ ...baseInput, kind: 'NEWSLETTER', name: undefined, website: 'spam' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rate limits repeated public submissions without storing raw IP addresses', async () => {
    const { service } = createService({ incr: vi.fn().mockResolvedValue(9) });
    await expect(service.createLead(baseInput, '203.0.113.9')).rejects.toBeInstanceOf(
      TooManyRequestsException,
    );
  });

  it('returns the same accepted lead for an idempotent retry', async () => {
    const requestHash = '3f831645c8f16a64f3ef41a76cc6f0d460911b94cc66cb7a96a4d938d54a6c8e';
    const create = vi.fn().mockRejectedValue({ code: 'P2002' });
    const findUnique = vi.fn().mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      kind: 'DEMO',
      createdAt: new Date('2026-10-08T00:00:00.000Z'),
      requestHash,
    });
    const { service } = createService({ create, findUnique });
    const hashingInput = {
      ...baseInput,
      email: 'alex@example.com',
    };
    const nodeCrypto = await import('node:crypto');
    const normalized = {
      kind: hashingInput.kind,
      name: hashingInput.name,
      email: hashingInput.email,
      company: null,
      teamSize: null,
      message: null,
      sourcePath: null,
      consent: true,
      metadata: {},
    };
    findUnique.mockResolvedValueOnce({
      id: '11111111-1111-4111-8111-111111111111',
      kind: 'DEMO',
      createdAt: new Date('2026-10-08T00:00:00.000Z'),
      requestHash: nodeCrypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex'),
    });

    await expect(service.createLead(hashingInput)).resolves.toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      status: 'RECEIVED',
    });
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
