import { BadRequestException, Injectable } from '@nestjs/common';
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

@Injectable()
export class WebhookEgressPolicyService {
  validateConfiguration(value: string): URL {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new BadRequestException('Webhook URL is invalid');
    }

    if (url.protocol !== 'https:') {
      throw new BadRequestException('Webhook URL must use HTTPS');
    }
    if (url.username || url.password) {
      throw new BadRequestException('Webhook URL must not contain credentials');
    }
    if (url.port && url.port !== '443') {
      throw new BadRequestException('Webhook URL must use the standard HTTPS port');
    }

    const hostname = url.hostname
      .toLowerCase()
      .replace(/\.$/, '')
      .replace(/^\[/, '')
      .replace(/\]$/, '');
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      hostname === '0.0.0.0'
    ) {
      throw new BadRequestException('Local-network webhook URLs are not allowed');
    }

    if (isIP(hostname) && this.isPrivateAddress(hostname)) {
      throw new BadRequestException('Private-network webhook URLs are not allowed');
    }

    url.hash = '';
    return url;
  }

  async assertDeliveryTarget(value: string): Promise<URL> {
    const url = this.validateConfiguration(value);
    const hostname = url.hostname
      .toLowerCase()
      .replace(/\.$/, '')
      .replace(/^\[/, '')
      .replace(/\]$/, '');
    if (isIP(hostname)) return url;

    let addresses: Array<{ address: string; family: number }>;
    try {
      addresses = await lookup(hostname, { all: true, verbatim: true });
    } catch {
      throw new Error('Webhook hostname could not be resolved');
    }
    if (addresses.length === 0) {
      throw new Error('Webhook hostname did not resolve to an address');
    }
    if (addresses.some((entry) => this.isPrivateAddress(entry.address))) {
      throw new Error('Webhook hostname resolved to a private or local address');
    }
    return url;
  }

  private isPrivateAddress(address: string): boolean {
    const family = isIP(address);
    if (family === 4) return this.isPrivateIpv4(address);
    if (family === 6) return this.isPrivateIpv6(address);
    return true;
  }

  private isPrivateIpv4(address: string): boolean {
    const [a = 0, b = 0] = address.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 2) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51) ||
      (a === 203 && b === 0) ||
      a >= 224
    );
  }

  private isPrivateIpv6(address: string): boolean {
    const normalized = address.toLowerCase();
    if (normalized.startsWith('::ffff:')) {
      const mapped = normalized.slice('::ffff:'.length);
      if (isIP(mapped) === 4) return this.isPrivateIpv4(mapped);
    }
    return (
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb') ||
      normalized.startsWith('ff')
    );
  }
}
