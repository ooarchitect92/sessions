import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  idempotencyKey: string;
}

export interface EmailDeliveryResult {
  provider: string;
  messageId: string;
}

@Injectable()
export class EmailDeliveryProvider {
  constructor(private readonly config: ConfigService) {}

  async send(message: EmailMessage): Promise<EmailDeliveryResult> {
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
        ...(message.html ? { html: message.html } : {}),
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
}
