import { describe, expect, it } from 'vitest';
import { API_KEY_SCOPE_CATALOG, isApiKeyScope } from './api-key-scopes';

describe('API key scope catalog', () => {
  it('contains distinct read and write scopes for supported domains', () => {
    expect(new Set(API_KEY_SCOPE_CATALOG).size).toBe(API_KEY_SCOPE_CATALOG.length);
    expect(isApiKeyScope('sessions:read')).toBe(true);
    expect(isApiKeyScope('memory:write')).toBe(true);
    expect(isApiKeyScope('admin:all')).toBe(false);
  });
});
