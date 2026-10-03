import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from 'node:crypto';

@Injectable()
export class WebhookCryptoService {
  constructor(private readonly config: ConfigService) {}

  createSecret(): string {
    return `whsec_${randomBytes(32).toString('base64url')}`;
  }

  encryptSecret(subscriptionId: string, secret: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const purpose = this.purpose(subscriptionId);
    cipher.setAAD(Buffer.from(purpose, 'utf8'));
    const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      'v1',
      iv.toString('base64url'),
      encrypted.toString('base64url'),
      tag.toString('base64url'),
    ].join('.');
  }

  decryptSecret(subscriptionId: string, payload: string): string {
    const [version, ivValue, encryptedValue, tagValue] = payload.split('.');
    if (version !== 'v1' || !ivValue || !encryptedValue || !tagValue) {
      throw new Error('Invalid encrypted webhook secret');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key(),
      Buffer.from(ivValue, 'base64url'),
    );
    decipher.setAAD(Buffer.from(this.purpose(subscriptionId), 'utf8'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  signature(secret: string, timestamp: string, body: string): string {
    return createHmac('sha256', secret)
      .update(`${timestamp}.${body}`)
      .digest('hex');
  }

  private purpose(subscriptionId: string): string {
    return `webhook-signing-secret:${subscriptionId}`;
  }

  private key(): Buffer {
    const encoded = this.config.getOrThrow<string>('AUTH_ENCRYPTION_KEY');
    const key = Buffer.from(encoded, 'hex');
    if (key.length !== 32) {
      throw new Error('AUTH_ENCRYPTION_KEY must be a 32-byte hexadecimal key');
    }
    return key;
  }
}
