import { describe, expect, it } from 'vitest';
import { isPublicIpAddress } from './webhook-http.client';

describe('webhook SSRF address policy', () => {
  it('rejects internal and link-local IPv4 addresses', () => {
    for (const address of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '224.0.0.1',
    ]) {
      expect(isPublicIpAddress(address)).toBe(false);
    }
  });

  it('rejects internal IPv6 addresses and accepts public examples', () => {
    expect(isPublicIpAddress('::1')).toBe(false);
    expect(isPublicIpAddress('fd00::1')).toBe(false);
    expect(isPublicIpAddress('fe80::1')).toBe(false);
    expect(isPublicIpAddress('8.8.8.8')).toBe(true);
    expect(isPublicIpAddress('2606:4700:4700::1111')).toBe(true);
  });
});
