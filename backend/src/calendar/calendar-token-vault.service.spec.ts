import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { CalendarTokenVaultService } from './calendar-token-vault.service';

function vault() {
  const config = {
    getOrThrow: (key: string) => {
      if (key !== 'AUTH_ENCRYPTION_KEY') throw new Error('unexpected key');
      return '11'.repeat(32);
    },
  } as ConfigService;
  return new CalendarTokenVaultService(config);
}

describe('CalendarTokenVaultService', () => {
  it('encrypts provider tokens with authenticated encryption', () => {
    const service = vault();
    const encrypted = service.encrypt('secret-refresh-token');

    expect(encrypted).not.toContain('secret-refresh-token');
    expect(encrypted.startsWith('v1.')).toBe(true);
    expect(service.decrypt(encrypted)).toBe('secret-refresh-token');
  });

  it('rejects tampered ciphertext', () => {
    const service = vault();
    const encrypted = service.encrypt('secret-refresh-token');
    const [version, iv, tag, ciphertext] = encrypted.split('.');
    const bytes = Buffer.from(ciphertext!, 'base64url');
    bytes[0] = (bytes[0] ?? 0) ^ 0x01;
    const tampered = [version, iv, tag, bytes.toString('base64url')].join('.');

    expect(() => service.decrypt(tampered)).toThrow();
  });
});
