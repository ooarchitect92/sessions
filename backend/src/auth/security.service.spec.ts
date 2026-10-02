import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { SecurityService } from './security.service';

function service(): SecurityService {
  return new SecurityService(
    new ConfigService({
      AUTH_IP_HASH_PEPPER: 'unit-test-pepper-that-is-long-enough',
      AUTH_ENCRYPTION_KEY:
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      MFA_ISSUER: 'Sessions Test',
    }),
  );
}

describe('SecurityService', () => {
  it('hashes passwords with a per-password salt and verifies them safely', async () => {
    const security = service();
    const first = await security.hashPassword('CorrectHorse#2026');
    const second = await security.hashPassword('CorrectHorse#2026');

    expect(first).not.toBe(second);
    await expect(security.verifyPassword('CorrectHorse#2026', first)).resolves.toBe(true);
    await expect(security.verifyPassword('WrongHorse#2026', first)).resolves.toBe(false);
    await expect(security.verifyPassword('CorrectHorse#2026', 'bcrypt$invalid')).resolves.toBe(
      false,
    );
  });

  it('creates opaque tokens that store only a SHA-256 digest', () => {
    const security = service();
    const issued = security.createOpaqueToken('10000000-0000-4000-8000-000000000001');
    const parsed = security.parseOpaqueToken(issued.token);

    expect(parsed?.id).toBe('10000000-0000-4000-8000-000000000001');
    expect(parsed?.secret).toBeTruthy();
    expect(issued.tokenHash).not.toContain(parsed!.secret);
    expect(security.verifyTokenDigest(parsed!.secret, issued.tokenHash)).toBe(true);
    expect(security.verifyTokenDigest(`${parsed!.secret}x`, issued.tokenHash)).toBe(false);
  });

  it('encrypts MFA secrets and hashes recovery codes without storing plaintext', () => {
    const security = service();
    const secret = security.generateTotpSecret();
    const encrypted = security.encryptMfaSecret(secret);
    const recovery = security.generateRecoveryCodes(4);

    expect(encrypted).not.toContain(secret);
    expect(security.decryptMfaSecret(encrypted)).toBe(secret);
    const deliveryToken = security.encryptSensitiveValue(
      'opaque-delivery-token',
      'email-verification-token',
    );
    expect(
      security.decryptSensitiveValue(deliveryToken, 'email-verification-token'),
    ).toBe('opaque-delivery-token');
    expect(() =>
      security.decryptSensitiveValue(deliveryToken, 'password-reset-token'),
    ).toThrow('purpose');
    expect(recovery.codes).toHaveLength(4);
    expect(recovery.hashes).toHaveLength(4);
    expect(recovery.hashes[0]).toBe(security.hashRecoveryCode(recovery.codes[0]!.toUpperCase()));
  });

  it('validates standards-compatible TOTP codes with a one-step clock window', () => {
    const security = service();
    const rfcSecret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

    expect(security.verifyTotp(rfcSecret, '287082', 59_000)).toBe(true);
    expect(security.verifyTotp(rfcSecret, '287083', 59_000)).toBe(false);
    expect(security.verifyTotp(rfcSecret, 'not-a-code', 59_000)).toBe(false);
  });

  it('derives stable, non-reversible IP correlation hashes', () => {
    const security = service();

    expect(security.hashIp('203.0.113.5')).toBe(security.hashIp('203.0.113.5'));
    expect(security.hashIp('203.0.113.5')).not.toBe(security.hashIp('203.0.113.6'));
    expect(security.hashIp(undefined)).toBeNull();
  });
});
