import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  EmailProvider,
  EmailSendRequest,
  EmailSendResult,
} from './email.types';

@Injectable()
export class HttpEmailProvider implements EmailProvider {
  readonly name = 'http';

  constructor(private readonly config: ConfigService) {}

  async send(request: EmailSendRequest): Promise<EmailSendResult> {
    const endpoint = this.config.getOrThrow<string>('EMAIL_HTTP_ENDPOINT');
    const apiKey = this.config.get<string>('EMAIL_API_KEY');

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(
        this.config.get<number>('EMAIL_REQUEST_TIMEOUT_MS', 60_000),
      ),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `Email provider returned ${response.status}${body ? `: ${body.slice(0, 500)}` : ''}`,
      );
    }

    const payload = (await response.json().catch(() => ({}))) as {
      id?: unknown;
      messageId?: unknown;
    };
    const messageId =
      typeof payload.messageId === 'string'
        ? payload.messageId
        : typeof payload.id === 'string'
          ? payload.id
          : undefined;

    return {
      provider: this.name,
      ...(messageId ? { messageId: messageId.slice(0, 320) } : {}),
    };
  }
}
