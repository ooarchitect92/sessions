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
  consentCreate?: ReturnType<typeof vi.fn>;
  auditCreate?: ReturnType<typeof vi.fn>;
  outboxCreate?: ReturnType<typeof vi.fn>;
  findUnique?: ReturnType<typeof vi.fn>;
  outboxFindFirst?: ReturnType<typeof vi.fn>;
  incr?: ReturnType<typeof vi.fn>;
}) {
  const create =
    overrides?.create ??
    vi.fn().mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      kind: 'DEMO',
      createdAt: new Date('2026-10-08T00:00:00.000Z'),
    });
  const consentCreate =
    overrides?.consentCreate ??
    vi.fn().mockResolvedValue({ id: '22222222-2222-4222-8222-222222222222' });
  const auditCreate = overrides?.auditCreate ?? vi.fn().mockResolvedValue({ id: 'audit-id' });
  const outboxCreate =
    overrides?.outboxCreate ??
    vi.fn().mockResolvedValue({ id: '33333333-3333-4333-8333-333333333333' });
  const findUnique = overrides?.findUnique ?? vi.fn();
  const outboxFindFirst =
    overrides?.outboxFindFirst ??
    vi.fn().mockResolvedValue({ id: '33333333-3333-4333-8333-333333333333' });
  const incr = overrides?.incr ?? vi.fn().mockResolvedValue(1);
  const transactionClient = {
    marketingLead: { create },
    marketingConsentEvidence: { create: consentCreate },
    marketingLeadAuditEvent: { create: auditCreate },
    marketingLeadOutboxEvent: { create: outboxCreate },
  };
  const prisma = {
    marketingLead: { findUnique },
    marketingLeadOutboxEvent: { findFirst: outboxFindFirst },
    $transaction: vi.fn(async (callback: (transaction: typeof transactionClient) => unknown) =>
      callback(transactionClient),
    ),
  };
  const redis = { incr, expire: vi.fn().mockResolvedValue(1) };
  const config = { getOrThrow: vi.fn().mockReturnValue('x'.repeat(32)) };
  return {
    service: new MarketingService(prisma as never, redis as never, config as never),
    create,
    consentCreate,
    auditCreate,
    outboxCreate,
    findUnique,
    outboxFindFirst,
    incr,
  };
}

describe('MarketingService', () => {
  it('commits lead, consent evidence, audit and outbox before acknowledging it', async () => {
    const { service, create, consentCreate, auditCreate, outboxCreate } = createService();

    await expect(
      service.createLead(
        {
          ...baseInput,
          metadata: {
            utmSource: 'launch',
            arbitraryPrivateField: 'must-not-be-stored',
          },
        },
        '127.0.0.1',
      ),
    ).resolves.toMatchObject({
      kind: 'DEMO',
      status: 'RECEIVED',
      receiptReference: '11111111-1111-4111-8111-111111111111',
      conversionEventId: '33333333-3333-4333-8333-333333333333',
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          submissionKey: baseInput.submissionKey,
          name: 'Alex',
          email: 'alex@example.com',
          consent: true,
          metadata: { utmSource: 'launch' },
          requestHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      }),
    );
    expect(consentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          leadId: '11111111-1111-4111-8111-111111111111',
          purpose: 'respond_to_request',
          version: 'enquiry-consent-v1',
          statementHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      }),
    );
    expect(auditCreate).toHaveBeenCalled();
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

  it('returns the original receipt for an idempotent retry without creating another durable record', async () => {
    const create = vi.fn().mockRejectedValue({ code: 'P2002' });
    const consentCreate = vi.fn();
    const auditCreate = vi.fn();
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
    const { service } = createService({
      create,
      consentCreate,
      auditCreate,
      outboxCreate,
      findUnique,
    });

    await expect(
      service.createLead({ ...baseInput, email: 'alex@example.com' }),
    ).resolves.toMatchObject({
      receiptReference: '11111111-1111-4111-8111-111111111111',
      conversionEventId: '33333333-3333-4333-8333-333333333333',
      status: 'RECEIVED',
    });
    expect(consentCreate).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
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
