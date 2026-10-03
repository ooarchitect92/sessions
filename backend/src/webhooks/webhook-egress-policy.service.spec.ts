import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { WebhookEgressPolicyService } from './webhook-egress-policy.service';

describe('WebhookEgressPolicyService', () => {
  const service = new WebhookEgressPolicyService();

  it('accepts public HTTPS webhook targets', () => {
    expect(
      service.validateConfiguration('https://hooks.example.com/events').toString(),
    ).toBe('https://hooks.example.com/events');
  });

  it('rejects unsafe protocols, credentials and nonstandard ports', () => {
    expect(() =>
      service.validateConfiguration('http://hooks.example.com/events'),
    ).toThrow(BadRequestException);
    expect(() =>
      service.validateConfiguration('https://user:pass@hooks.example.com/events'),
    ).toThrow(BadRequestException);
    expect(() =>
      service.validateConfiguration('https://hooks.example.com:8443/events'),
    ).toThrow(BadRequestException);
  });

  it('rejects localhost, private and reserved address literals', () => {
    for (const url of [
      'https://localhost/hook',
      'https://127.0.0.1/hook',
      'https://10.1.2.3/hook',
      'https://192.168.1.5/hook',
      'https://169.254.1.1/hook',
      'https://192.0.2.10/hook',
      'https://198.51.100.10/hook',
      'https://203.0.113.10/hook',
      'https://[::1]/hook',
      'https://[::ffff:127.0.0.1]/hook',
    ]) {
      expect(() => service.validateConfiguration(url), url).toThrow(
        BadRequestException,
      );
    }
  });
});
