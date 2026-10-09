import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { isIP } from 'node:net';

export interface WebhookHttpResponse {
  statusCode: number;
  bodySnippet: string;
}

@Injectable()
export class WebhookHttpClient {
  constructor(private readonly config: ConfigService) {}

  async post(
    urlValue: string,
    body: string,
    headers: Record<string, string>,
  ): Promise<WebhookHttpResponse> {
    const target = await resolvePublicWebhookTarget(urlValue);
    const timeoutMs = this.config.get<number>('WEBHOOK_REQUEST_TIMEOUT_MS', 10_000);
    const maxBytes = this.config.get<number>('WEBHOOK_RESPONSE_MAX_BYTES', 65_536);

    return new Promise<WebhookHttpResponse>((resolve, reject) => {
      const req = request(
        target.url,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(body).toString(),
            ...headers,
          },
          servername: target.url.hostname,
          lookup: (_hostname, _options, callback) => {
            callback(null, target.address, target.family);
          },
        },
        (response) => {
          const chunks: Buffer[] = [];
          let total = 0;
          response.on('data', (chunk: Buffer | string) => {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            if (total < maxBytes) {
              const remaining = maxBytes - total;
              chunks.push(buffer.subarray(0, remaining));
              total += Math.min(buffer.length, remaining);
            }
          });
          response.on('end', () => {
            resolve({
              statusCode: response.statusCode ?? 0,
              bodySnippet: Buffer.concat(chunks).toString('utf8').slice(0, 1000),
            });
          });
        },
      );

      req.setTimeout(timeoutMs, () =>
        req.destroy(new Error('webhook_request_timeout')),
      );
      req.on('error', reject);
      req.end(body);
    });
  }
}

export async function resolvePublicWebhookTarget(urlValue: string): Promise<{
  url: URL;
  address: string;
  family: 4 | 6;
}> {
  const url = new URL(urlValue);
  if (url.protocol !== 'https:') throw new Error('webhook_https_required');
  if (url.username || url.password) {
    throw new Error('webhook_url_credentials_forbidden');
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.home.arpa')
  ) {
    throw new Error('webhook_private_hostname_forbidden');
  }

  const literalFamily = isIP(hostname);
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily as 4 | 6 }]
    : (await lookup(hostname, { all: true, verbatim: true })).map((entry) => ({
        address: entry.address,
        family: entry.family as 4 | 6,
      }));

  if (addresses.length === 0) throw new Error('webhook_dns_empty');
  for (const entry of addresses) {
    if (!isPublicIpAddress(entry.address)) {
      throw new Error('webhook_private_address_forbidden');
    }
  }

  const selected = addresses[0]!;
  return { url, address: selected.address, family: selected.family };
}

export function isPublicIpAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family === 6) return isPublicIpv6(address);
  return false;
}

function isPublicIpv4(address: string): boolean {
  const octets = address.split('.').map(Number);
  if (
    octets.length !== 4 ||
    octets.some(
      (value) => !Number.isInteger(value) || value < 0 || value > 255,
    )
  ) {
    return false;
  }
  const [a, b] = octets as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a >= 224) return false;
  return true;
}

function isPublicIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === '::' || normalized === '::1') return false;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return false;
  if (/^fe[89ab]/.test(normalized)) return false;
  if (normalized.startsWith('ff')) return false;
  if (normalized.startsWith('::ffff:')) {
    return isPublicIpv4(normalized.slice('::ffff:'.length));
  }
  return true;
}
