import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac } from 'node:crypto';

type QueryValue = string | number | boolean;

@Injectable()
export class S3ObjectStoreService {
  constructor(private readonly config: ConfigService) {}

  createDownloadUrl(
    objectKey: string,
    filename: string,
    expiresInSeconds: number,
    now = new Date(),
  ): string {
    return this.createPresignedUrl(
      'GET',
      objectKey,
      expiresInSeconds,
      {
        'response-content-disposition': `inline; filename="${this.safeFilename(filename)}"`,
      },
      now,
    );
  }

  createAttachmentUrl(
    objectKey: string,
    filename: string,
    expiresInSeconds: number,
    now = new Date(),
  ): string {
    return this.createPresignedUrl(
      'GET',
      objectKey,
      expiresInSeconds,
      {
        'response-content-disposition': `attachment; filename="${this.safeFilename(filename)}"`,
      },
      now,
    );
  }

  async downloadObject(
    objectKey: string,
    maxBytes = 250_000_000,
  ): Promise<Uint8Array> {
    const url = this.createPresignedUrl('GET', objectKey, 60, {}, new Date(), false);
    const response = await fetch(url);
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `Object download failed with ${response.status}${body ? `: ${body.slice(0, 500)}` : ''}`,
      );
    }

    const declaredLength = Number(response.headers.get('content-length') ?? '0');
    if (declaredLength > maxBytes) {
      throw new Error(
        `Object exceeds transcription source limit (${declaredLength} > ${maxBytes})`,
      );
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) {
      throw new Error(
        `Object exceeds transcription source limit (${bytes.byteLength} > ${maxBytes})`,
      );
    }
    return bytes;
  }

  async deleteObject(objectKey: string): Promise<void> {
    const url = this.createPresignedUrl('DELETE', objectKey, 60);
    const response = await fetch(url, { method: 'DELETE' });
    if (!response.ok && response.status !== 404) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `Object deletion failed with ${response.status}${body ? `: ${body.slice(0, 500)}` : ''}`,
      );
    }
  }

  createPresignedUrl(
    method: 'GET' | 'DELETE',
    objectKey: string,
    expiresInSeconds: number,
    extraQuery: Record<string, QueryValue> = {},
    now = new Date(),
    usePublicEndpoint = true,
  ): string {
    const internalEndpoint = this.config.getOrThrow<string>('S3_ENDPOINT');
    const endpoint = new URL(
      method === 'GET' && usePublicEndpoint
        ? this.config.get<string>('S3_PUBLIC_ENDPOINT', internalEndpoint)
        : internalEndpoint,
    );
    const bucket = this.config.getOrThrow<string>('S3_BUCKET');
    const region = this.config.getOrThrow<string>('S3_REGION');
    const accessKey = this.config.getOrThrow<string>('S3_ACCESS_KEY');
    const secretKey = this.config.getOrThrow<string>('S3_SECRET_KEY');
    const forcePathStyle = this.config.get<boolean>('S3_FORCE_PATH_STYLE', true);

    const url = new URL(endpoint.toString());
    const encodedKey = objectKey
      .split('/')
      .map((segment) => this.encode(segment))
      .join('/');
    const basePath = endpoint.pathname.replace(/\/+$/, '');

    if (forcePathStyle) {
      url.pathname = `${basePath}/${this.encode(bucket)}/${encodedKey}`;
    } else {
      url.hostname = `${bucket}.${endpoint.hostname}`;
      url.pathname = `${basePath}/${encodedKey}`;
    }

    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const scope = `${dateStamp}/${region}/s3/aws4_request`;
    const query: Record<string, QueryValue> = {
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${accessKey}/${scope}`,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': Math.max(1, Math.min(604800, expiresInSeconds)),
      'X-Amz-SignedHeaders': 'host',
      ...extraQuery,
    };

    const canonicalQuery = Object.entries(query)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${this.encode(key)}=${this.encode(String(value))}`)
      .join('&');
    const canonicalHeaders = `host:${url.host}\n`;
    const canonicalRequest = [
      method,
      url.pathname,
      canonicalQuery,
      canonicalHeaders,
      'host',
      'UNSIGNED-PAYLOAD',
    ].join('\n');
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      scope,
      createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');
    const signingKey = this.signatureKey(secretKey, dateStamp, region);
    const signature = createHmac('sha256', signingKey)
      .update(stringToSign)
      .digest('hex');

    url.search = `${canonicalQuery}&X-Amz-Signature=${signature}`;
    return url.toString();
  }

  private signatureKey(secret: string, date: string, region: string): Buffer {
    const dateKey = createHmac('sha256', `AWS4${secret}`).update(date).digest();
    const regionKey = createHmac('sha256', dateKey).update(region).digest();
    const serviceKey = createHmac('sha256', regionKey).update('s3').digest();
    return createHmac('sha256', serviceKey).update('aws4_request').digest();
  }

  private encode(value: string): string {
    return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
  }

  private safeFilename(value: string): string {
    const normalized = value
      .normalize('NFKD')
      .replace(/[^\w.-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return normalized.slice(0, 120) || 'recording.mp4';
  }
}
