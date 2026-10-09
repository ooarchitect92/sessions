import { BadRequestException } from '@nestjs/common';
import { isIP } from 'node:net';
import { domainToASCII } from 'node:url';

export function normalizeCustomDomainHostname(value: unknown): string {
  if (typeof value !== 'string') {
    throw new BadRequestException('A hostname is required');
  }
  const raw = value.trim().toLowerCase().replace(/\.$/, '');
  if (
    !raw ||
    raw.includes('://') ||
    raw.includes('/') ||
    raw.includes(':') ||
    raw.includes('*') ||
    isIP(raw) !== 0
  ) {
    throw new BadRequestException(
      'Enter a valid hostname without protocol or path',
    );
  }
  const ascii = domainToASCII(raw);
  if (!ascii || ascii.length > 200) {
    throw new BadRequestException('Custom domain hostname is invalid');
  }
  if (
    ascii === 'localhost' ||
    ascii.endsWith('.localhost') ||
    ascii.endsWith('.local') ||
    ascii.endsWith('.internal') ||
    ascii.endsWith('.home.arpa')
  ) {
    throw new BadRequestException('Local or internal hostnames are not allowed');
  }
  const labels = ascii.split('.');
  if (
    labels.length < 2 ||
    labels.some(
      (label) =>
        label.length < 1 ||
        label.length > 63 ||
        !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
    )
  ) {
    throw new BadRequestException('Custom domain hostname is invalid');
  }
  return ascii;
}
