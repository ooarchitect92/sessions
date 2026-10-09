import { describe, expect, it } from 'vitest';
import { renderBrandedEmailHtml, workspaceEmailBrand } from './branded-email.renderer';

describe('branded email renderer', () => {
  it('applies validated workspace colors and escapes untrusted text', () => {
    const brand = workspaceEmailBrand({
      name: 'Acme <Team>',
      settings: {
        branding: {
          primaryColor: '#123456',
          accentColor: '#abcdef',
          logoUrl: 'https://cdn.example.com/logo.png',
        },
      },
    });
    const html = renderBrandedEmailHtml({
      brand,
      heading: 'Demo <script>alert(1)</script>',
      text: 'Hello <b>Guest</b>\nSee you soon.',
    });

    expect(html).toContain('#123456');
    expect(html).toContain('#abcdef');
    expect(html).toContain('https://cdn.example.com/logo.png');
    expect(html).toContain('Demo &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Hello &lt;b&gt;Guest&lt;/b&gt;<br>See you soon.');
    expect(html).not.toContain('<script>');
  });

  it('falls back when branding values are unsafe', () => {
    const brand = workspaceEmailBrand({
      name: 'Workspace',
      settings: { branding: { primaryColor: 'red;display:none', logoUrl: 'http://unsafe.test/logo.png' } },
    });
    expect(brand.primaryColor).toBe('#183f38');
    expect(brand.logoUrl).toBeNull();
  });
});