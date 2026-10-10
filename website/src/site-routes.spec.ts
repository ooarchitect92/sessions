import { describe, expect, it } from 'vitest';
import { resolveMarketingRoute, routeDefinitionFor } from './site-routes';

describe('public marketing route resolution', () => {
  it('resolves canonical marketing and resource routes', () => {
    expect(resolveMarketingRoute('/')).toBe('home');
    expect(resolveMarketingRoute('/product')).toBe('product');
    expect(resolveMarketingRoute('/resources/agenda-led-meetings/')).toBe('resource-agenda');
    expect(resolveMarketingRoute('/privacy?utm_source=test')).toBe('privacy');
  });

  it('does not turn unknown routes into the homepage', () => {
    expect(resolveMarketingRoute('/does-not-exist')).toBe('not-found');
  });

  it('keeps utility routes out of the index where configured', () => {
    expect(routeDefinitionFor('search')?.index).toBe(false);
    expect(routeDefinitionFor('consent')?.index).toBe(false);
    expect(routeDefinitionFor('home')?.index).toBe(true);
  });
});
