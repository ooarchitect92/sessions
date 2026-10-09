import { ConfigService } from '@nestjs/config';
import { ProviderConnectionKind } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ProviderConnectionsService } from '../integrations/provider-connections.service';
import { WebhookHttpClient } from '../integrations/webhook-http.client';
import { EmailDeliveryProvider } from './email-delivery.provider';

const organizationId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';

function dependencies(
  managed:
    | Awaited<ReturnType<ProviderConnectionsService['resolveActiveCredential']>>
    | null = null,
) {
  const providerConnections = {
    resolveActiveCredential: vi.fn().mockResolvedValue(managed),
    recordExecution: vi.fn().mockResolvedValue(undefined),
  } as unknown as ProviderConnectionsService;
  const http = {
    post: vi.fn().mockResolvedValue({
      statusCode: 202,
      bodySnippet: JSON.stringify({ messageId: 'managed-message' }),
    }),
  } as unknown as WebhookHttpClient;
  return { providerConnections, http };
}

describe('EmailDeliveryProvider', () => {
  it('returns a deterministic provider message id in mock mode', async () => {
    const config = {
      get: <T>(key: string, fallback?: T) =>
        (key === 'EMAIL_PROVIDER' ? 'mock' : fallback) as T,
    } as ConfigService;
    const { providerConnections, http } = dependencies();
    const provider = new EmailDeliveryProvider(
      config,
      providerConnections,
      http,
    );
    const first = await provider.send({
      organizationId,
      workspaceId,
      to: 'guest@example.com',
      subject: 'Reminder',
      text: 'Starts soon',
      idempotencyKey: 'booking-reminder:test',
    });
    const second = await provider.send({
      organizationId,
      workspaceId,
      to: 'guest@example.com',
      subject: 'Reminder',
      text: 'Starts soon',
      idempotencyKey: 'booking-reminder:test',
    });

    expect(first.provider).toBe('mock');
    expect(first.messageId).toBe(second.messageId);
    expect(first.messageId).toHaveLength(32);
  });

  it('uses a governed workspace email connection before environment fallback', async () => {
    const config = {
      get: <T>(key: string, fallback?: T) =>
        (key === 'EMAIL_FROM' ? 'workspace@example.com' : fallback) as T,
    } as ConfigService;
    const { providerConnections, http } = dependencies({
      id: '55555555-5555-4555-8555-555555555555',
      kind: ProviderConnectionKind.EMAIL_HTTP,
      endpointUrl: 'https://provider.example.test/send',
      secret: 'workspace-secret',
      config: {},
      credentialVersion: 1,
    });
    const provider = new EmailDeliveryProvider(
      config,
      providerConnections,
      http,
    );

    const result = await provider.send({
      organizationId,
      workspaceId,
      to: 'guest@example.com',
      subject: 'Reminder',
      text: 'Starts soon',
      idempotencyKey: 'booking-reminder:managed',
    });

    expect(result).toEqual({
      provider: 'workspace_email_http',
      messageId: 'managed-message',
    });
    expect(http.post).toHaveBeenCalledOnce();
    expect(providerConnections.recordExecution).toHaveBeenCalledWith(
      '55555555-5555-4555-8555-555555555555',
      true,
    );
  });

  it('rejects delivery when no workspace connection exists and the provider is disabled', async () => {
    const config = {
      get: <T>(key: string, fallback?: T) =>
        (key === 'EMAIL_PROVIDER' ? 'disabled' : fallback) as T,
    } as ConfigService;
    const { providerConnections, http } = dependencies();
    const provider = new EmailDeliveryProvider(
      config,
      providerConnections,
      http,
    );

    await expect(
      provider.send({
        organizationId,
        workspaceId,
        to: 'guest@example.com',
        subject: 'Reminder',
        text: 'Starts soon',
        idempotencyKey: 'booking-reminder:test-disabled',
      }),
    ).rejects.toThrow('email_provider_disabled');
  });
});
