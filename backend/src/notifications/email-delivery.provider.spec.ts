import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { EmailDeliveryProvider } from './email-delivery.provider';

describe('EmailDeliveryProvider', () => {
  it('returns a deterministic provider message id in mock mode', async () => {
    const config = {
      get: <T>(key: string, fallback?: T) =>
        (key === 'EMAIL_PROVIDER' ? 'mock' : fallback) as T,
    } as ConfigService;
    const provider = new EmailDeliveryProvider(config);
    const first = await provider.send({
      to: 'guest@example.com',
      subject: 'Reminder',
      text: 'Starts soon',
      idempotencyKey: 'booking-reminder:test',
    });
    const second = await provider.send({
      to: 'guest@example.com',
      subject: 'Reminder',
      text: 'Starts soon',
      idempotencyKey: 'booking-reminder:test',
    });

    expect(first.provider).toBe('mock');
    expect(first.messageId).toBe(second.messageId);
    expect(first.messageId).toHaveLength(32);
  });

  it('rejects delivery when the provider is disabled', async () => {
    const config = {
      get: <T>(key: string, fallback?: T) =>
        (key === 'EMAIL_PROVIDER' ? 'disabled' : fallback) as T,
    } as ConfigService;
    const provider = new EmailDeliveryProvider(config);

    await expect(
      provider.send({
        to: 'guest@example.com',
        subject: 'Reminder',
        text: 'Starts soon',
        idempotencyKey: 'booking-reminder:test-disabled',
      }),
    ).rejects.toThrow('email_provider_disabled');
  });
});
