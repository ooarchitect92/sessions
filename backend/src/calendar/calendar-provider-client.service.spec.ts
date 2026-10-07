import { ConfigService } from '@nestjs/config';
import { CalendarProvider } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { CalendarProviderClientService } from './calendar-provider-client.service';

const config = {
  getOrThrow: (key: string) => {
    const values: Record<string, string> = {
      GOOGLE_CALENDAR_CLIENT_ID: 'google-client',
      GOOGLE_CALENDAR_CLIENT_SECRET: 'google-secret',
      MICROSOFT_CALENDAR_CLIENT_ID: 'ms-client',
      MICROSOFT_CALENDAR_CLIENT_SECRET: 'ms-secret',
    };
    const value = values[key];
    if (!value) throw new Error(`missing ${key}`);
    return value;
  },
  get: <T>(key: string, fallback: T) =>
    (key === 'MICROSOFT_CALENDAR_TENANT' ? 'common' : fallback) as T,
} as ConfigService;

describe('CalendarProviderClientService authorization URLs', () => {
  const service = new CalendarProviderClientService(config);

  it('builds Google OAuth with offline calendar scope and state', () => {
    const url = new URL(
      service.buildAuthorizationUrl(
        CalendarProvider.GOOGLE,
        'state-value',
        'https://api.example.com/v1/calendar/oauth/google/callback',
      ),
    );
    expect(url.hostname).toBe('accounts.google.com');
    expect(url.searchParams.get('state')).toBe('state-value');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('scope')).toContain('calendar.readonly');
  });

  it('builds Microsoft OAuth with offline and calendar scopes', () => {
    const url = new URL(
      service.buildAuthorizationUrl(
        CalendarProvider.MICROSOFT,
        'state-value',
        'https://api.example.com/v1/calendar/oauth/microsoft/callback',
      ),
    );
    expect(url.hostname).toBe('login.microsoftonline.com');
    expect(url.searchParams.get('state')).toBe('state-value');
    expect(url.searchParams.get('scope')).toContain('offline_access');
    expect(url.searchParams.get('scope')).toContain('Calendars.Read');
  });
});
