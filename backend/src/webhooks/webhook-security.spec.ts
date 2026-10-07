import { describe, expect, it } from 'vitest';
import { signWebhookPayload } from './webhook-security';

describe('signWebhookPayload', () => {
  it('creates a deterministic versioned HMAC signature', () => {
    expect(
      signWebhookPayload('secret', '1700000000', '{"event":"session.started"}'),
    ).toBe(
      'v1=f21bac9160e9ea27d2e336818450eab890c0e2450190ef7e4f8d3a2994b8bf24',
    );
  });
});
