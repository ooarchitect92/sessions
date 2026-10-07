import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CalendarProvider } from '@prisma/client';

export interface OAuthTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes: string[];
}

export interface CalendarAccountProfile {
  id?: string;
  email?: string;
}

export interface BusyInterval {
  startsAt: Date;
  endsAt: Date;
}

@Injectable()
export class CalendarProviderClientService {
  constructor(private readonly config: ConfigService) {}

  buildAuthorizationUrl(
    provider: CalendarProvider,
    state: string,
    redirectUri: string,
  ): string {
    if (provider === CalendarProvider.GOOGLE) {
      const clientId = this.config.getOrThrow<string>('GOOGLE_CALENDAR_CLIENT_ID');
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set(
        'scope',
        [
          'openid',
          'email',
          'https://www.googleapis.com/auth/calendar.readonly',
        ].join(' '),
      );
      url.searchParams.set('access_type', 'offline');
      url.searchParams.set('prompt', 'consent');
      url.searchParams.set('state', state);
      return url.toString();
    }

    const clientId = this.config.getOrThrow<string>('MICROSOFT_CALENDAR_CLIENT_ID');
    const tenant = this.config.get<string>('MICROSOFT_CALENDAR_TENANT', 'common');
    const url = new URL(
      `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize`,
    );
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set(
      'scope',
      ['offline_access', 'openid', 'email', 'User.Read', 'Calendars.Read'].join(' '),
    );
    url.searchParams.set('response_mode', 'query');
    url.searchParams.set('state', state);
    return url.toString();
  }

  async exchangeCode(
    provider: CalendarProvider,
    code: string,
    redirectUri: string,
  ): Promise<OAuthTokenSet> {
    const body = new URLSearchParams();
    body.set('grant_type', 'authorization_code');
    body.set('code', code);
    body.set('redirect_uri', redirectUri);

    const response =
      provider === CalendarProvider.GOOGLE
        ? await this.googleTokenRequest(body)
        : await this.microsoftTokenRequest(body);
    return this.parseTokenSet(response);
  }

  async refresh(
    provider: CalendarProvider,
    refreshToken: string,
  ): Promise<OAuthTokenSet> {
    const body = new URLSearchParams();
    body.set('grant_type', 'refresh_token');
    body.set('refresh_token', refreshToken);
    const response =
      provider === CalendarProvider.GOOGLE
        ? await this.googleTokenRequest(body)
        : await this.microsoftTokenRequest(body);
    return this.parseTokenSet(response);
  }

  async getProfile(
    provider: CalendarProvider,
    accessToken: string,
  ): Promise<CalendarAccountProfile> {
    const url =
      provider === CalendarProvider.GOOGLE
        ? 'https://openidconnect.googleapis.com/v1/userinfo'
        : 'https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName';
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      throw new BadGatewayException(
        `Calendar profile lookup failed with ${response.status}`,
      );
    }
    const payload = (await response.json()) as Record<string, unknown>;
    if (provider === CalendarProvider.GOOGLE) {
      return {
        ...(typeof payload.sub === 'string' ? { id: payload.sub } : {}),
        ...(typeof payload.email === 'string' ? { email: payload.email } : {}),
      };
    }
    const email =
      typeof payload.mail === 'string'
        ? payload.mail
        : typeof payload.userPrincipalName === 'string'
          ? payload.userPrincipalName
          : null;
    return {
      ...(typeof payload.id === 'string' ? { id: payload.id } : {}),
      ...(email ? { email } : {}),
    };
  }

  async listBusy(
    provider: CalendarProvider,
    accessToken: string,
    calendarId: string,
    accountEmail: string | null,
    timeMin: Date,
    timeMax: Date,
  ): Promise<BusyInterval[]> {
    return provider === CalendarProvider.GOOGLE
      ? this.googleBusy(accessToken, calendarId, timeMin, timeMax)
      : this.microsoftBusy(
          accessToken,
          calendarId,
          accountEmail,
          timeMin,
          timeMax,
        );
  }

  private async googleBusy(
    accessToken: string,
    calendarId: string,
    timeMin: Date,
    timeMax: Date,
  ): Promise<BusyInterval[]> {
    const response = await fetch(
      'https://www.googleapis.com/calendar/v3/freeBusy',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          timeMin: timeMin.toISOString(),
          timeMax: timeMax.toISOString(),
          items: [{ id: calendarId }],
        }),
      },
    );
    if (!response.ok) {
      throw new BadGatewayException(
        `Google Calendar free/busy failed with ${response.status}`,
      );
    }
    const payload = (await response.json()) as {
      calendars?: Record<string, { busy?: Array<{ start: string; end: string }> }>;
    };
    return (payload.calendars?.[calendarId]?.busy ?? []).map((item) => ({
      startsAt: new Date(item.start),
      endsAt: new Date(item.end),
    }));
  }

  private async microsoftBusy(
    accessToken: string,
    calendarId: string,
    accountEmail: string | null,
    timeMin: Date,
    timeMax: Date,
  ): Promise<BusyInterval[]> {
    const schedule =
      calendarId !== 'primary'
        ? calendarId
        : accountEmail;
    if (!schedule) return [];

    const response = await fetch(
      'https://graph.microsoft.com/v1.0/me/calendar/getSchedule',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
          Prefer: 'outlook.timezone="UTC"',
        },
        body: JSON.stringify({
          schedules: [schedule],
          startTime: {
            dateTime: timeMin.toISOString().replace('Z', ''),
            timeZone: 'UTC',
          },
          endTime: {
            dateTime: timeMax.toISOString().replace('Z', ''),
            timeZone: 'UTC',
          },
          availabilityViewInterval: 15,
        }),
      },
    );
    if (!response.ok) {
      throw new BadGatewayException(
        `Microsoft Calendar schedule lookup failed with ${response.status}`,
      );
    }
    const payload = (await response.json()) as {
      value?: Array<{
        scheduleItems?: Array<{
          start?: { dateTime?: string };
          end?: { dateTime?: string };
        }>;
      }>;
    };
    return (payload.value?.[0]?.scheduleItems ?? [])
      .map((item) => ({
        startsAt: new Date(`${item.start?.dateTime ?? ''}Z`),
        endsAt: new Date(`${item.end?.dateTime ?? ''}Z`),
      }))
      .filter(
        (item) =>
          Number.isFinite(item.startsAt.getTime()) &&
          Number.isFinite(item.endsAt.getTime()),
      );
  }

  private async googleTokenRequest(body: URLSearchParams) {
    body.set(
      'client_id',
      this.config.getOrThrow<string>('GOOGLE_CALENDAR_CLIENT_ID'),
    );
    body.set(
      'client_secret',
      this.config.getOrThrow<string>('GOOGLE_CALENDAR_CLIENT_SECRET'),
    );
    return this.tokenRequest('https://oauth2.googleapis.com/token', body);
  }

  private async microsoftTokenRequest(body: URLSearchParams) {
    body.set(
      'client_id',
      this.config.getOrThrow<string>('MICROSOFT_CALENDAR_CLIENT_ID'),
    );
    body.set(
      'client_secret',
      this.config.getOrThrow<string>('MICROSOFT_CALENDAR_CLIENT_SECRET'),
    );
    body.set(
      'scope',
      ['offline_access', 'openid', 'email', 'User.Read', 'Calendars.Read'].join(
        ' ',
      ),
    );
    const tenant = this.config.get<string>('MICROSOFT_CALENDAR_TENANT', 'common');
    return this.tokenRequest(
      `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`,
      body,
    );
  }

  private async tokenRequest(url: string, body: URLSearchParams) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    const payload = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null;
    if (!response.ok || !payload) {
      throw new BadGatewayException(
        `Calendar OAuth token exchange failed with ${response.status}`,
      );
    }
    return payload;
  }

  private parseTokenSet(payload: Record<string, unknown>): OAuthTokenSet {
    const accessToken = payload.access_token;
    if (typeof accessToken !== 'string' || !accessToken) {
      throw new BadGatewayException('Calendar provider omitted access token');
    }
    const expiresIn =
      typeof payload.expires_in === 'number'
        ? payload.expires_in
        : typeof payload.expires_in === 'string'
          ? Number(payload.expires_in)
          : undefined;
    const refreshToken =
      typeof payload.refresh_token === 'string' ? payload.refresh_token : null;
    const expiresAt =
      expiresIn && Number.isFinite(expiresIn)
        ? new Date(Date.now() + Math.max(30, expiresIn - 60) * 1000)
        : null;
    return {
      accessToken,
      ...(refreshToken ? { refreshToken } : {}),
      ...(expiresAt ? { expiresAt } : {}),
      scopes:
        typeof payload.scope === 'string'
          ? payload.scope.split(/\s+/).filter(Boolean)
          : [],
    };
  }
}
