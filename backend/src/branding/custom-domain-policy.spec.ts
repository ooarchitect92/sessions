import { describe, expect, it } from 'vitest';
import { normalizeCustomDomainHostname } from './custom-domain-policy';

describe('custom domain hostname policy', () => {
  it('normalizes case, trailing dots and IDN hostnames', () => {
    expect(normalizeCustomDomainHostname('Meet.Example.COM.')).toBe(
      'meet.example.com',
    );
    expect(normalizeCustomDomainHostname('münich.example')).toBe(
      'xn--mnich-kva.example',
    );
  });

  it('rejects protocols, IPs, wildcards and internal names', () => {
    for (const value of [
      'https://meet.example.com',
      '127.0.0.1',
      '::1',
      '*.example.com',
      'meet.local',
      'service.internal',
      'localhost',
    ]) {
      expect(() => normalizeCustomDomainHostname(value)).toThrow();
    }
  });
});
