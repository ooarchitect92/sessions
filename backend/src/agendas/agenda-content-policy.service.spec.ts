import { AgendaItemType } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { AgendaContentPolicyService } from './agenda-content-policy.service';

describe('AgendaContentPolicyService', () => {
  const service = new AgendaContentPolicyService();

  it('converts YouTube links to privacy-enhanced embed URLs', () => {
    expect(
      service.normalize(AgendaItemType.VIDEO, {
        url: 'https://www.youtube.com/watch?v=abc123',
      }),
    ).toEqual({
      url: 'https://www.youtube.com/watch?v=abc123',
      embedUrl: 'https://www.youtube-nocookie.com/embed/abc123',
      provider: 'youtube',
      renderMode: 'iframe',
    });
  });

  it('blocks localhost and private network URLs', () => {
    expect(() =>
      service.normalize(AgendaItemType.WEBSITE, {
        url: 'https://localhost/internal',
      }),
    ).toThrow('Local-network');

    expect(() =>
      service.normalize(AgendaItemType.WEBSITE, {
        url: 'https://192.168.1.10/admin',
      }),
    ).toThrow('Private-network');
  });

  it('requires HTTPS for embedded external content', () => {
    expect(() =>
      service.normalize(AgendaItemType.PRESENTATION, {
        url: 'http://example.com/deck',
      }),
    ).toThrow('HTTPS');
  });

  it('keeps text agenda content bounded', () => {
    expect(
      service.normalize(AgendaItemType.TEXT, { text: '  discussion notes  ' }),
    ).toEqual({ text: 'discussion notes' });
  });
});
