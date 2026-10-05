import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { HttpEmailProvider } from './http-email.provider';

describe('HttpEmailProvider', () => {
  it('sends provider-neutral JSON and returns the provider message id', async () => {
    const config = new ConfigService({
      EMAIL_HTTP_ENDPOINT: 'https://mail.example.test/send',
      EMAIL_API_KEY: 'secret',
      EMAIL_REQUEST_TIMEOUT_MS: 1000,
    });
    const provider = new HttpEmailProvider(config);

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ messageId: 'provider-123' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

    await expect(
      provider.send({
        from: 'noreply@example.test',
        to: ['person@example.test'],
        subject: 'Follow-up',
        text: 'Thanks for joining.',
      }),
    ).resolves.toEqual({
      provider: 'http',
      messageId: 'provider-123',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    fetchMock.mockRestore();
  });
});
