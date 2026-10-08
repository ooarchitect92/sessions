import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

@Injectable()
export class CalendarTokenVaultService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    this.key = Buffer.from(config.getOrThrow<string>('AUTH_ENCRYPTION_KEY'), 'hex');
  }

  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ['v1', iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.');
  }

  decrypt(value: string): string {
    const [version, ivEncoded, tagEncoded, ciphertextEncoded] = value.split('.');
    if (
      version !== 'v1' ||
      !ivEncoded ||
      !tagEncoded ||
      !ciphertextEncoded
    ) {
      throw new Error('calendar_token_ciphertext_invalid');
    }
    const iv = this.decodeBase64UrlCanonical(ivEncoded);
    const tag = this.decodeBase64UrlCanonical(tagEncoded);
    const ciphertext = this.decodeBase64UrlCanonical(ciphertextEncoded);
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) {
      throw new Error('calendar_token_ciphertext_invalid');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
  }

  private decodeBase64UrlCanonical(value: string): Buffer {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) {
      throw new Error('calendar_token_ciphertext_invalid');
    }
    const decoded = Buffer.from(value, 'base64url');
    if (decoded.toString('base64url') !== value) {
      throw new Error('calendar_token_ciphertext_invalid');
    }
    return decoded;
  }
}
