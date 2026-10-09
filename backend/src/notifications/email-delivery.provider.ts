import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProviderConnectionKind } from '@prisma/client';
import { createHash } from 'node:crypto';
import { ProviderConnectionsService } from '../integrations/provider-connections.service';
import { WebhookHttpClient } from '../integrations/webhook-http.client';

export interface EmailMessage {
  organizationId: string;
  workspaceId: string;
  to: string;
  subject: string;
  text: string;
  idempotencyKey: string;
}

export interface EmailDeliveryResult {
  provider: string;
  messageId: string;
}

@Injectable()
export class EmailDeliveryProvider {
  constructor(
    private readonly config: ConfigService,
    private readonly providerConnections: ProviderConnectionsService,
    private readonly http: WebhookHttpClient,
  ) {}

  async send(message: EmailMessage): Promise<EmailDeliveryResult> {
    const managed = await this.providerConnections.resolveActiveCredential(
      message.organizationId,
      message.workspaceId,
      ProviderConnectionKind.EMAIL_HTTP,
    );
    if (managed) {
      const config =
        managed.config && typeof managed.config === 'object' && !Array.isArray(managed.config)
          ? (managed.config as Record<string, unknown>)
          : {};
      const configuredFrom =
        typeof config.fromEmail === 'string' ? config.fromEmail : undefined;
      const from =
        configuredFrom ?? this.config.get<string>('EMAIL_FROM');
      if (!from) throw new Error('workspace_email_from_not_configured');

      try {
        const response = await this.http.post(
          managed.endpointUrl,
          JSON.stringify({
            from,
            to: message.to,
            subject: message.subject,
            text: message.text,
          }),
          {
            authorization: `Bearer ${managed.secret}`,
            'idempotency-key': message.idempotencyKey,
          },
        );
        if (response.statusCode < 200 || response.statusCode >= 300) {
          throw new Error(`email_provider_http_${response.statusCode}`);
        }
        await this.providerConnections.recordExecution(managed.id, true);
        const payload = this.parsePayload(response.bodySnippet);
        return {
          provider: 'workspace_email_http',
          messageId:
            payload?.id ??
            payload?.messageId ??
            createHash('sha256')
              .update(message.idempotencyKey)
              .digest('hex'),
        };
      } catch (error: unknown) {
        await this.providerConnections.recordExecution(
          managed.id,
          false,
          error instanceof Error ? error.message : 'email_provider_failed',
        );
        throw error;
      }
    }

    const provider = this.config.get<'disabled' | 'mock' | 'http'>(
      'EMAIL_PROVIDER',
      'disabled',
    );
    if (provider === 'disabled') {
      throw new Error('email_provider_disabled');
    }
    if (provider === 'mock') {
      return {
        provider: 'mock',
        messageId: createHash('sha256')
          .update(message.idempotencyKey)
          .digest('hex')
          .slice(0, 32),
      };
    }

    const endpoint = this.config.get<string>('EMAIL_HTTP_ENDPOINT');
    const apiKey = this.config.get<string>('EMAIL_HTTP_API_KEY');
    const from = this.config.get<string>('EMAIL_FROM');
    if (!endpoint || !apiKey || !from) {
      throw new Error('email_http_provider_not_configured');
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'idempotency-key': message.idempotencyKey,
      },
      body: JSON.stringify({
        from,
        to: message.to,
        subject: message.subject,
        text: message.text,
      }),
    });
    if (!response.ok) {
      throw new Error(`email_provider_http_${response.status}`);
    }
    const payload = (await response.json().catch(() => null)) as
      | { id?: string; messageId?: string }
      | null;
    return {
      provider: 'http',
      messageId:
        payload?.id ??
        payload?.messageId ??
        createHash('sha256').update(message.idempotencyKey).digest('hex'),
    };
  }

  private parsePayload(
    value: string,
  ): { id?: string; messageId?: string } | null {
    if (!value) return null;
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      return {
        ...(typeof parsed.id === 'string' ? { id: parsed.id } : {}),
        ...(typeof parsed.messageId === 'string'
          ? { messageId: parsed.messageId }
          : {}),
      };
    } catch {
      return null;
    }
  }
}
