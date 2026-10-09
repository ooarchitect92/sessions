import { SetMetadata } from '@nestjs/common';

export const API_KEY_SCOPE_CATALOG = [
  'sessions:read',
  'sessions:write',
  'rooms:read',
  'rooms:write',
  'bookings:read',
  'bookings:write',
  'events:read',
  'events:write',
  'memory:read',
  'memory:write',
  'analytics:read',
  'analytics:export',
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPE_CATALOG)[number];

export const API_KEY_SCOPES_KEY = 'apiKeyScopes';

export const ApiKeyScopes = (
  ...scopes: ApiKeyScope[]
): MethodDecorator & ClassDecorator => SetMetadata(API_KEY_SCOPES_KEY, scopes);

export function isApiKeyScope(value: string): value is ApiKeyScope {
  return (API_KEY_SCOPE_CATALOG as readonly string[]).includes(value);
}
