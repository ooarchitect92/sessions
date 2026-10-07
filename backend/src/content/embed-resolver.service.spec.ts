import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { EmbedResolverService } from './embed-resolver.service';

describe('EmbedResolverService', () => {
  const service = new EmbedResolverService();

  it('normalizes YouTube links to a privacy-enhanced embed URL', () => {
    const resolved = service.resolve('https://youtu.be/dQw4w9WgXcQ');

    expect(resolved.provider).toBe('youtube');
    expect(resolved.embedUrl).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    );
    expect(resolved.referrerPolicy).toBe('no-referrer');
  });

  it('rejects insecure and private hosts', () => {
    expect(() => service.resolve('http://example.com')).toThrow(
      BadRequestException,
    );
    expect(() => service.resolve('https://127.0.0.1/demo')).toThrow(
      BadRequestException,
    );
  });

  it('keeps generic HTTPS URLs sandboxed without same-origin access', () => {
    const resolved = service.resolve('https://example.com/demo');

    expect(resolved.provider).toBe('generic');
    expect(resolved.embedUrl).toBe('https://example.com/demo');
    expect(resolved.sandbox).not.toContain('allow-same-origin');
  });
});
