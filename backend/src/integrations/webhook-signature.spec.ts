import { describe, expect, it } from 'vitest';
import { signWebhookPayload, verifyWebhookSignature } from './webhook-signature';

describe('webhook signatures', () => {
  it('signs a timestamped payload deterministically', () => {
    const body = JSON.stringify({ event: 'session.ended', id: 'evt_1' });
    const signature = signWebhookPayload('secret', 1_760_000_000, body);
    expect(signature).toHaveLength(64);
    expect(verifyWebhookSignature('secret', 1_760_000_000, body, signature)).toBe(true);
    expect(verifyWebhookSignature('secret', 1_760_000_001, body, signature)).toBe(false);
  });
});
