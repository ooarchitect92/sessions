import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { WebhookCryptoService } from './webhook-crypto.service';

describe('WebhookCryptoService', () => {
  const service = new WebhookCryptoService(
    new ConfigService({
      AUTH_ENCRYPTION_KEY:
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    }),
  );

  it('encrypts webhook secrets with subscription-bound authenticated encryption', () => {
    const secret = 'whsec_example_secret';
    const encrypted = service.encryptSecret(
      '10000000-0000-4000-8000-000000000001',
      secret,
    );

    expect(encrypted).not.toContain(secret);
    expect(
      service.decryptSecret(
        '10000000-0000-4000-8000-000000000001',
        encrypted,
      ),
    ).toBe(secret);
    expect(() =>
      service.decryptSecret(
        '10000000-0000-4000-8000-000000000002',
        encrypted,
      ),
    ).toThrow();
  });

  it('creates deterministic HMAC signatures for timestamped payloads', () => {
    const secret = 'whsec_example_secret';
    const signature = service.signature(
      secret,
      '1791028800',
      '{"type":"session.ended"}',
    );

    expect(signature).toMatch(/^[a-f0-9]{64}$/);
    expect(
      service.signature(secret, '1791028800', '{"type":"session.ended"}'),
    ).toBe(signature);
    expect(
      service.signature(secret, '1791028801', '{"type":"session.ended"}'),
    ).not.toBe(signature);
  });
});
