import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { request } from 'node:https';
import { resolvePublicWebhookTarget } from '../integrations/webhook-http.client';

@Injectable()
export class EnterpriseHttpService {
  constructor(private readonly config: ConfigService) {}

  async getJson<T>(urlValue: string): Promise<T> {
    const result = await this.request('GET', urlValue, undefined, {
      accept: 'application/json',
    });
    if (result.statusCode < 200 || result.statusCode >= 300) {
      throw new Error(`enterprise_http_status_${result.statusCode}`);
    }
    return JSON.parse(result.body) as T;
  }

  async postForm<T>(
    urlValue: string,
    values: Record<string, string>,
  ): Promise<T> {
    const body = new URLSearchParams(values).toString();
    const result = await this.request('POST', urlValue, body, {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    });
    if (result.statusCode < 200 || result.statusCode >= 300) {
      throw new Error(`enterprise_http_status_${result.statusCode}`);
    }
    return JSON.parse(result.body) as T;
  }

  private async request(
    method: 'GET' | 'POST',
    urlValue: string,
    body?: string,
    headers: Record<string, string> = {},
  ): Promise<{ statusCode: number; body: string }> {
    const target = await resolvePublicWebhookTarget(urlValue);
    const timeoutMs = this.config.get<number>(
      'ENTERPRISE_HTTP_TIMEOUT_MS',
      10_000,
    );
    const maxBytes = this.config.get<number>(
      'ENTERPRISE_HTTP_RESPONSE_MAX_BYTES',
      256 * 1024,
    );

    return new Promise((resolve, reject) => {
      const requestHeaders: Record<string, string> = {
        'user-agent': 'Sessions-Enterprise-Identity/1.0',
        ...headers,
      };
      if (body !== undefined) {
        requestHeaders['content-length'] = String(Buffer.byteLength(body));
      }

      const req = request(
        target.url,
        {
          method,
          headers: requestHeaders,
          servername: target.url.hostname,
          lookup: (_hostname, _options, callback) => {
            callback(null, target.address, target.family);
          },
        },
        (response) => {
          const chunks: Buffer[] = [];
          let total = 0;
          let exceeded = false;
          response.on('data', (chunk: Buffer | string) => {
            const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            if (total + value.length > maxBytes) {
              exceeded = true;
              response.destroy(new Error('enterprise_http_response_too_large'));
              return;
            }
            total += value.length;
            chunks.push(value);
          });
          response.on('end', () => {
            if (exceeded) return;
            resolve({
              statusCode: response.statusCode ?? 0,
              body: Buffer.concat(chunks).toString('utf8'),
            });
          });
          response.on('error', reject);
        },
      );
      req.setTimeout(timeoutMs, () =>
        req.destroy(new Error('enterprise_http_timeout')),
      );
      req.on('error', reject);
      if (body !== undefined) req.write(body);
      req.end();
    });
  }
}
