import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

@Injectable()
export class CalendarCryptoService {
  constructor(private readonly config: ConfigService) {}

  encrypt(connectionId: string, field: 'access' | 'refresh', value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    cipher.setAAD(Buffer.from(this.purpose(connectionId, field), 'utf8'));
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ['v1', iv.toString('base64url'), encrypted.toString('base64url'), tag.toString('base64url')].join('.');
  }

  decrypt(connectionId: string, field: 'access' | 'refresh', payload: string): string {
    const [version, ivValue, encryptedValue, tagValue] = payload.split('.');
    if (version !== 'v1' || !ivValue || !encryptedValue || !tagValue) {
      throw new Error('Invalid encrypted calendar credential');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key(),
      Buffer.from(ivValue, 'base64url'),
    );
    decipher.setAAD(Buffer.from(this.purpose(connectionId, field), 'utf8'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  private purpose(connectionId: string, field: 'access' | 'refresh'): string {
    return `calendar-oauth:${connectionId}:${field}`;
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
