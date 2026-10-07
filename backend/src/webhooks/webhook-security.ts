import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

export function signWebhookPayload(
  secret: string,
  timestamp: string,
  body: string,
): string {
  const digest = createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');
  return `v1=${digest}`;
}

export async function assertSafeWebhookTarget(
  rawUrl: string,
  allowLocalhost = false,
): Promise<URL> {
  const url = new URL(rawUrl);
  if (url.username || url.password) {
    throw new Error('Webhook URLs cannot include credentials');
  }
  if (url.protocol !== 'https:' && !(allowLocalhost && url.protocol === 'http:')) {
    throw new Error('Webhook endpoint must use HTTPS');
  }

  const hostname = url.hostname.toLowerCase();
  if (allowLocalhost && (hostname === 'localhost' || hostname === '127.0.0.1')) {
    return url;
  }

  const resolved = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (!resolved.length) throw new Error('Webhook hostname could not be resolved');

  for (const entry of resolved) {
    if (isPrivateAddress(entry.address)) {
      throw new Error('Webhook endpoint cannot resolve to a private or reserved address');
    }
  }
  return url;
}

function isPrivateAddress(address: string): boolean {
  if (address.includes(':')) {
    const normalized = address.toLowerCase();
    return (
      normalized === '::1' ||
      normalized === '::' ||
      normalized.startsWith('fe80:') ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd')
    );
  }
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  const [a, b] = parts as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}
