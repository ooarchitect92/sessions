import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { EventBrandingDto } from './event-branding.dto';

async function errors(value: Record<string, unknown>) {
  return validate(plainToInstance(EventBrandingDto, value));
}

describe('EventBrandingDto', () => {
  it('accepts a safe visual landing-page configuration', async () => {
    await expect(
      errors({
        primaryColor: '#183f38',
        accentColor: '#dcefe8',
        eyebrow: 'Interactive summit',
        heroHeadline: 'Modern customer success',
        heroSubheadline: 'A focused event for operators.',
        heroImageUrl: 'https://cdn.example.com/event.jpg',
        aboutHeading: 'What you will learn',
        aboutBody: 'Practical sessions and live Q&A.',
        ctaLabel: 'Reserve a seat',
        showPresenters: true,
        showEventFacts: true,
        sectionOrder: ['ABOUT', 'PRESENTERS', 'DETAILS'],
      }),
    ).resolves.toHaveLength(0);
  });

  it('rejects non-HTTPS hero images and invalid colors', async () => {
    const result = await errors({
      primaryColor: 'red',
      heroImageUrl: 'http://example.com/image.jpg',
    });
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects duplicate or unknown sections', async () => {
    const duplicates = await errors({
      sectionOrder: ['ABOUT', 'ABOUT'],
    });
    const unknown = await errors({
      sectionOrder: ['ABOUT', 'UNKNOWN'],
    });
    expect(duplicates.length).toBeGreaterThan(0);
    expect(unknown.length).toBeGreaterThan(0);
  });
});
