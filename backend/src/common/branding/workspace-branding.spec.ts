import { describe, expect, it } from 'vitest';
import {
  normalizeWorkspaceBranding,
  publicWorkspaceBranding,
} from './workspace-branding';

describe('workspace branding', () => {
  it('normalizes safe public branding values', () => {
    expect(
      normalizeWorkspaceBranding({
        brandName: 'Acme',
        logoUrl: 'https://cdn.example.com/logo.svg',
        primaryColor: '#ABCDEF',
        accentColor: '#123456',
        fontFamily: 'Inter',
        waitingRoomImageUrl: 'https://cdn.example.com/cover.jpg',
        hideSessionsBranding: true,
      }),
    ).toEqual({
      brandName: 'Acme',
      logoUrl: 'https://cdn.example.com/logo.svg',
      primaryColor: '#abcdef',
      accentColor: '#123456',
      fontFamily: 'Inter',
      waitingRoomImageUrl: 'https://cdn.example.com/cover.jpg',
      hideSessionsBranding: true,
    });
  });

  it('rejects insecure URLs and unsupported colors', () => {
    expect(() =>
      normalizeWorkspaceBranding({ logoUrl: 'http://example.com/logo.svg' }),
    ).toThrow('logoUrl must use HTTPS');

    expect(() =>
      normalizeWorkspaceBranding({ primaryColor: 'red' }),
    ).toThrow('primaryColor must use a six-digit hex color');
  });

  it('falls back safely for malformed persisted settings', () => {
    expect(
      publicWorkspaceBranding(
        {
          branding: {
            primaryColor: 'not-a-color',
          },
        },
        'Sales',
      ),
    ).toMatchObject({
      brandName: 'Sales',
      primaryColor: '#183f38',
    });
  });
});
