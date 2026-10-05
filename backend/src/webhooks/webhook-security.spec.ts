import { describe, expect, it } from 'vitest';
import { signWebhookPayload } from './webhook-security';

describe('signWebhookPayload', () => {
  it('creates a deterministic versioned HMAC signature', () => {
    expect(
      signWebhookPayload('secret', '1700000000', '{"event":"session.started"}'),
    ).toBe(
      'v1=68171d8bea57135e4af24802422566ee1265e431646c891d9569273f3ae4fffd',
    );
  });
});
