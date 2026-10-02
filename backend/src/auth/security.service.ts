import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';

const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const PASSWORD_KEY_BYTES = 64;
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

@Injectable()
export class SecurityService {
  constructor(private readonly config: ConfigService) {}

  async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16);
    const derived = await this.derivePassword(password, salt);
    return [
      'scrypt',
      SCRYPT_COST,
      SCRYPT_BLOCK_SIZE,
      SCRYPT_PARALLELIZATION,
      salt.toString('base64url'),
      derived.toString('base64url'),
    ].join('$');
  }

  async verifyPassword(password: string, encoded: string | null): Promise<boolean> {
    if (!encoded) return false;
    const [algorithm, cost, blockSize, parallelization, saltValue, hashValue] =
      encoded.split('$');
    if (
      algorithm !== 'scrypt' ||
      Number(cost) !== SCRYPT_COST ||
      Number(blockSize) !== SCRYPT_BLOCK_SIZE ||
      Number(parallelization) !== SCRYPT_PARALLELIZATION ||
      !saltValue ||
      !hashValue
    ) {
      return false;
    }
    try {
      const salt = Buffer.from(saltValue, 'base64url');
      const expected = Buffer.from(hashValue, 'base64url');
      const actual = await this.derivePassword(password, salt);
      return expected.length === actual.length && timingSafeEqual(expected, actual);
    } catch {
      return false;
    }
  }

  createOpaqueToken(id: string, bytes = 32): { token: string; tokenHash: string } {
    const secret = randomBytes(bytes).toString('base64url');
    return {
      token: `${id}.${secret}`,
      tokenHash: this.digestToken(secret),
    };
  }

  parseOpaqueToken(token: string): { id: string; secret: string } | null {
    const separator = token.indexOf('.');
    if (separator <= 0 || separator === token.length - 1) return null;
    return { id: token.slice(0, separator), secret: token.slice(separator + 1) };
  }

  digestToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  verifyTokenDigest(token: string, expectedDigest: string): boolean {
    const actual = Buffer.from(this.digestToken(token), 'hex');
    const expected = Buffer.from(expectedDigest, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  hashIp(ip: string | undefined): string | null {
    if (!ip) return null;
    const pepper = this.config.getOrThrow<string>('AUTH_IP_HASH_PEPPER');
    return createHmac('sha256', pepper).update(ip).digest('hex');
  }

  generateTotpSecret(): string {
    return this.encodeBase32(randomBytes(20));
  }

  createTotpUri(secret: string, email: string): string {
    const issuer = this.config.get<string>('MFA_ISSUER') ?? 'Sessions';
    const label = `${issuer}:${email}`;
    const query = new URLSearchParams({
      secret,
      issuer,
      algorithm: 'SHA1',
      digits: String(TOTP_DIGITS),
      period: String(TOTP_PERIOD_SECONDS),
    });
    return `otpauth://totp/${encodeURIComponent(label)}?${query.toString()}`;
  }

  verifyTotp(secret: string, candidate: string, now = Date.now()): boolean {
    if (!/^\d{6}$/.test(candidate)) return false;
    const counter = Math.floor(now / 1000 / TOTP_PERIOD_SECONDS);
    return [-1, 0, 1].some((offset) => {
      const expected = this.totpCode(secret, counter + offset);
      return timingSafeEqual(Buffer.from(expected), Buffer.from(candidate));
    });
  }

  encryptMfaSecret(secret: string): string {
    return this.encryptSensitiveValue(secret, 'mfa-secret');
  }

  decryptMfaSecret(payload: string): string {
    return this.decryptSensitiveValue(payload, 'mfa-secret');
  }

  encryptSensitiveValue(value: string, purpose: string): string {
    const key = this.authEncryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(purpose, 'utf8'));
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      'v1',
      Buffer.from(purpose, 'utf8').toString('base64url'),
      iv.toString('base64url'),
      encrypted.toString('base64url'),
      tag.toString('base64url'),
    ].join('.');
  }

  decryptSensitiveValue(payload: string, expectedPurpose: string): string {
    const [version, purposeValue, ivValue, encryptedValue, tagValue] = payload.split('.');
    if (
      version !== 'v1' ||
      !purposeValue ||
      !ivValue ||
      !encryptedValue ||
      !tagValue
    ) {
      throw new Error('Invalid encrypted sensitive value');
    }
    const purpose = Buffer.from(purposeValue, 'base64url').toString('utf8');
    if (purpose !== expectedPurpose) {
      throw new Error('Encrypted value purpose does not match');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.authEncryptionKey(),
      Buffer.from(ivValue, 'base64url'),
    );
    decipher.setAAD(Buffer.from(purpose, 'utf8'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  generateRecoveryCodes(count = 8): { codes: string[]; hashes: string[] } {
    const codes = Array.from({ length: count }, () => {
      const value = randomBytes(6).toString('hex');
      return `${value.slice(0, 6)}-${value.slice(6)}`;
    });
    return {
      codes,
      hashes: codes.map((code) => this.hashRecoveryCode(code)),
    };
  }

  hashRecoveryCode(code: string): string {
    return this.digestToken(code.trim().toLowerCase().replaceAll(' ', ''));
  }

  private async derivePassword(password: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      scrypt(
        password,
        salt,
        PASSWORD_KEY_BYTES,
        {
          N: SCRYPT_COST,
          r: SCRYPT_BLOCK_SIZE,
          p: SCRYPT_PARALLELIZATION,
          maxmem: 64 * 1024 * 1024,
        },
        (error, derivedKey) => {
          if (error) reject(error);
          else resolve(derivedKey);
        },
      );
    });
  }

  private authEncryptionKey(): Buffer {
    const encoded = this.config.getOrThrow<string>('AUTH_ENCRYPTION_KEY');
    const key = Buffer.from(encoded, 'hex');
    if (key.length !== 32) {
      throw new Error('AUTH_ENCRYPTION_KEY must be a 32-byte hexadecimal key');
    }
    return key;
  }

  private totpCode(secret: string, counter: number): string {
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigUInt64BE(BigInt(counter));
    const digest = createHmac('sha1', this.decodeBase32(secret))
      .update(counterBuffer)
      .digest();
    const offset = digest[digest.length - 1]! & 0x0f;
    const binary =
      ((digest[offset]! & 0x7f) << 24) |
      ((digest[offset + 1]! & 0xff) << 16) |
      ((digest[offset + 2]! & 0xff) << 8) |
      (digest[offset + 3]! & 0xff);
    return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
  }

  private encodeBase32(input: Buffer): string {
    let bits = 0;
    let value = 0;
    let output = '';
    for (const byte of input) {
      value = (value << 8) | byte;
      bits += 8;
      while (bits >= 5) {
        output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
    return output;
  }

  private decodeBase32(value: string): Buffer {
    let bits = 0;
    let accumulator = 0;
    const bytes: number[] = [];
    for (const character of value.toUpperCase().replaceAll('=', '')) {
      const index = BASE32_ALPHABET.indexOf(character);
      if (index < 0) throw new Error('Invalid base32 secret');
      accumulator = (accumulator << 5) | index;
      bits += 5;
      if (bits >= 8) {
        bytes.push((accumulator >>> (bits - 8)) & 0xff);
        bits -= 8;
      }
    }
    return Buffer.from(bytes);
  }
}
