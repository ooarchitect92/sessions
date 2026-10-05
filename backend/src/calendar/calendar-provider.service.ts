import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CalendarProvider } from '@prisma/client';

export interface CalendarTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes: string[];
}

export interface CalendarIdentity {
  id: string;
  email: string | null;
}

export interface CalendarBusyInterval {
  startsAt: Date;
  endsAt: Date;
  providerEventId?: string;
}

@Injectable()
export class CalendarProviderService {
  constructor(private readonly config: ConfigService) {}

  authorizationUrl(
    provider: CalendarProvider,
    state: string,
    codeChallenge: string,
  ): string {
    const redirectUri = this.redirectUri(provider);
    const clientId = this.clientId(provider);
    if (!clientId) {
      throw new ServiceUnavailableException(
        `${provider.toLowerCase()} calendar OAuth is not configured`,
      );
    }

    if (provider === CalendarProvider.GOOGLE) {
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('access_type', 'offline');
      url.searchParams.set('prompt', 'consent');
      url.searchParams.set(
        'scope',
        [
          'openid',
          'email',
          'https://www.googleapis.com/auth/calendar.readonly',
        ].join(' '),
      );
      url.searchParams.set('state', state);
      url.searchParams.set('code_challenge', codeChallenge);
      url.searchParams.set('code_challenge_method', 'S256');
      return url.toString();
    }

    const tenant = this.config.get<string>('MICROSOFT_CALENDAR_TENANT') ?? 'common';
    const url = new URL(
      `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize`,
    );
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('response_mode', 'query');
    url.searchParams.set(
      'scope',
      ['openid', 'email', 'offline_access', 'Calendars.Read'].join(' '),
    );
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
  }

  async exchangeCode(
    provider: CalendarProvider,
    code: string,
    codeVerifier: string,
  ): Promise<CalendarTokenSet> {
    const clientId = this.clientId(provider);
    const clientSecret = this.clientSecret(provider);
    if (!clientId || !clientSecret) {
      throw new ServiceUnavailableException('Calendar OAuth provider is not configured');
    }

    const tokenUrl =
      provider === CalendarProvider.GOOGLE
        ? 'https://oauth2.googleapis.com/token'
        : `https://login.microsoftonline.com/${encodeURIComponent(
            this.config.get<string>('MICROSOFT_CALENDAR_TENANT') ?? 'common',
          )}/oauth2/v2.0/token`;

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: this.redirectUri(provider),
    });
    if (provider === CalendarProvider.MICROSOFT) {
      body.set('scope', 'openid email offline_access Calendars.Read');
    }

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    const payload = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!response.ok || typeof payload.access_token !== 'string') {
      throw new BadGatewayException('Calendar OAuth token exchange failed');
    }

    return {
      accessToken: payload.access_token,
      ...(typeof payload.refresh_token === 'string'
        ? { refreshToken: payload.refresh_token }
        : {}),
      ...(typeof payload.expires_in === 'number'
        ? { expiresAt: new Date(Date.now() + payload.expires_in * 1000) }
        : {}),
      scopes:
        typeof payload.scope === 'string'
          ? payload.scope.split(/\s+/).filter(Boolean)
          : [],
    };
  }

  async refreshToken(
    provider: CalendarProvider,
    refreshToken: string,
  ): Promise<CalendarTokenSet> {
    const clientId = this.clientId(provider);
    const clientSecret = this.clientSecret(provider);
    if (!clientId || !clientSecret) {
      throw new ServiceUnavailableException('Calendar OAuth provider is not configured');
    }

    const tokenUrl =
      provider === CalendarProvider.GOOGLE
        ? 'https://oauth2.googleapis.com/token'
        : `https://login.microsoftonline.com/${encodeURIComponent(
            this.config.get<string>('MICROSOFT_CALENDAR_TENANT') ?? 'common',
          )}/oauth2/v2.0/token`;

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });
    if (provider === CalendarProvider.MICROSOFT) {
      body.set('scope', 'openid email offline_access Calendars.Read');
    }

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    const payload = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!response.ok || typeof payload.access_token !== 'string') {
      throw new BadGatewayException('Calendar access token refresh failed');
    }

    return {
      accessToken: payload.access_token,
      refreshToken:
        typeof payload.refresh_token === 'string'
          ? payload.refresh_token
          : refreshToken,
      ...(typeof payload.expires_in === 'number'
        ? { expiresAt: new Date(Date.now() + payload.expires_in * 1000) }
        : {}),
      scopes:
        typeof payload.scope === 'string'
          ? payload.scope.split(/\s+/).filter(Boolean)
          : [],
    };
  }

  async identity(
    provider: CalendarProvider,
    accessToken: string,
  ): Promise<CalendarIdentity> {
    const endpoint =
      provider === CalendarProvider.GOOGLE
        ? 'https://openidconnect.googleapis.com/v1/userinfo'
        : 'https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName';

    const response = await fetch(endpoint, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new BadGatewayException('Calendar provider identity lookup failed');
    }
    const payload = (await response.json()) as Record<string, unknown>;

    if (provider === CalendarProvider.GOOGLE) {
      if (typeof payload.sub !== 'string') {
        throw new BadGatewayException('Google account identity is incomplete');
      }
      return {
        id: payload.sub,
        email: typeof payload.email === 'string' ? payload.email : null,
      };
    }

    if (typeof payload.id !== 'string') {
      throw new BadGatewayException('Microsoft account identity is incomplete');
    }
    const email =
      typeof payload.mail === 'string'
        ? payload.mail
        : typeof payload.userPrincipalName === 'string'
          ? payload.userPrincipalName
          : null;
    return { id: payload.id, email };
  }

  async busy(
    provider: CalendarProvider,
    accessToken: string,
    accountEmail: string | null,
    calendarIds: string[],
    startsAt: Date,
    endsAt: Date,
  ): Promise<CalendarBusyInterval[]> {
    if (endsAt <= startsAt) {
      throw new BadRequestException('Busy-time range is invalid');
    }

    if (provider === CalendarProvider.GOOGLE) {
      const ids = calendarIds.length > 0 ? calendarIds : ['primary'];
      const response = await fetch(
        'https://www.googleapis.com/calendar/v3/freeBusy',
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${accessToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            timeMin: startsAt.toISOString(),
            timeMax: endsAt.toISOString(),
            items: ids.map((id) => ({ id })),
          }),
          signal: AbortSignal.timeout(15_000),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        calendars?: Record<
          string,
          { busy?: Array<{ start?: string; end?: string }> }
        >;
      };
      if (!response.ok) {
        throw new BadGatewayException('Google Calendar free/busy lookup failed');
      }
      const intervals: CalendarBusyInterval[] = [];
      for (const calendar of Object.values(payload.calendars ?? {})) {
        for (const busy of calendar.busy ?? []) {
          if (!busy.start || !busy.end) continue;
          const start = new Date(busy.start);
          const end = new Date(busy.end);
          if (
            Number.isFinite(start.getTime()) &&
            Number.isFinite(end.getTime()) &&
            end > start
          ) {
            intervals.push({ startsAt: start, endsAt: end });
          }
        }
      }
      return intervals;
    }

    if (!accountEmail) {
      throw new BadGatewayException(
        'Microsoft Calendar account email is required for availability sync',
      );
    }
    const schedules =
      calendarIds.length > 0 ? calendarIds : [accountEmail];
    const response = await fetch(
      'https://graph.microsoft.com/v1.0/me/calendar/getSchedule',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          schedules,
          startTime: {
            dateTime: startsAt.toISOString().replace(/Z$/, ''),
            timeZone: 'UTC',
          },
          endTime: {
            dateTime: endsAt.toISOString().replace(/Z$/, ''),
            timeZone: 'UTC',
          },
          availabilityViewInterval: 30,
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    const payload = (await response.json().catch(() => ({}))) as {
      value?: Array<{
        scheduleItems?: Array<{
          start?: { dateTime?: string; timeZone?: string };
          end?: { dateTime?: string; timeZone?: string };
        }>;
      }>;
    };
    if (!response.ok) {
      throw new BadGatewayException('Microsoft Calendar schedule lookup failed');
    }

    const intervals: CalendarBusyInterval[] = [];
    for (const schedule of payload.value ?? []) {
      for (const item of schedule.scheduleItems ?? []) {
        const startValue = item.start?.dateTime;
        const endValue = item.end?.dateTime;
        if (!startValue || !endValue) continue;
        const start = new Date(
          /[zZ]|[+-]\d\d:\d\d$/.test(startValue)
            ? startValue
            : `${startValue}Z`,
        );
        const end = new Date(
          /[zZ]|[+-]\d\d:\d\d$/.test(endValue)
            ? endValue
            : `${endValue}Z`,
        );
        if (
          Number.isFinite(start.getTime()) &&
          Number.isFinite(end.getTime()) &&
          end > start
        ) {
          intervals.push({ startsAt: start, endsAt: end });
        }
      }
    }
    return intervals;
  }

  redirectUri(provider: CalendarProvider): string {
    const explicit =
      provider === CalendarProvider.GOOGLE
        ? this.config.get<string>('GOOGLE_CALENDAR_REDIRECT_URI')
        : this.config.get<string>('MICROSOFT_CALENDAR_REDIRECT_URI');
    if (explicit) return explicit;
    const base = this.config.getOrThrow<string>('PUBLIC_API_URL').replace(/\/$/, '');
    return `${base}/v1/integrations/calendars/oauth/callback/${provider.toLowerCase()}`;
  }

  private clientId(provider: CalendarProvider): string | undefined {
    return provider === CalendarProvider.GOOGLE
      ? this.config.get<string>('GOOGLE_CALENDAR_CLIENT_ID')
      : this.config.get<string>('MICROSOFT_CALENDAR_CLIENT_ID');
  }

  private clientSecret(provider: CalendarProvider): string | undefined {
    return provider === CalendarProvider.GOOGLE
      ? this.config.get<string>('GOOGLE_CALENDAR_CLIENT_SECRET')
      : this.config.get<string>('MICROSOFT_CALENDAR_CLIENT_SECRET');
  }
}
