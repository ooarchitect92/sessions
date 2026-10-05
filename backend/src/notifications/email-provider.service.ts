import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string | null;
}

export interface SendEmailResult {
  provider: string;
  messageId: string;
}

@Injectable()
export class EmailProviderService {
  private readonly logger = new Logger(EmailProviderService.name);

  constructor(private readonly config: ConfigService) {}

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const enabled = this.config.get<boolean>('EMAIL_DELIVERY_ENABLED', false);
    if (!enabled) {
      throw new Error('Email delivery is disabled');
    }

    const provider = this.config.get<string>('EMAIL_PROVIDER', 'console');
    if (provider === 'console') {
      this.logger.log(
        `[email:console] to=${input.to} subject=${JSON.stringify(input.subject)}`,
      );
      return {
        provider: 'console',
        messageId: `console-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 10)}`,
      };
    }

    if (provider !== 'resend') {
      throw new Error(`Unsupported email provider: ${provider}`);
    }

    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (!apiKey) throw new Error('RESEND_API_KEY is not configured');

    const from = this.config.getOrThrow<string>('EMAIL_FROM');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        ...(input.html ? { html: input.html } : {}),
      }),
      signal: AbortSignal.timeout(
        this.config.get<number>('EMAIL_TIMEOUT_MS', 10_000),
      ),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      error?: { message?: string };
    };
    if (!response.ok || !payload.id) {
      const message =
        payload.error?.message ??
        payload.message ??
        `Email provider returned HTTP ${response.status}`;
      throw new Error(message.slice(0, 1000));
    }

    return { provider: 'resend', messageId: payload.id };
  }
}
