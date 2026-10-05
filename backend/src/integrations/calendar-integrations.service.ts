import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CalendarConnectionStatus,
  CalendarProvider,
  type WorkspaceRole,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import type { Principal } from '../common/auth/principal';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { WorkerPrismaService } from '../database/worker-prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { SecurityService } from '../auth/security.service';

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

@Injectable()
export class CalendarIntegrationsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly worker: WorkerPrismaService,
    private readonly config: ConfigService,
    private readonly security: SecurityService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async list(principal: Principal) {
    return this.database.run(principal, async (transaction) => {
      const rows = await transaction.calendarConnection.findMany({
        where: { userId: principal.userId },
        orderBy: [{ provider: 'asc' }, { createdAt: 'asc' }],
      });
      return rows.map((connection) => ({
        id: connection.id,
        provider: connection.provider,
        providerAccountId: connection.providerAccountId,
        accountEmail: connection.accountEmail,
        calendarId: connection.calendarId,
        scopes: connection.scopes,
        syncEnabled: connection.syncEnabled,
        status: connection.status,
        tokenExpiresAt: connection.tokenExpiresAt,
        lastSyncedAt: connection.lastSyncedAt,
        lastError: connection.lastError,
        version: connection.version,
        createdAt: connection.createdAt,
        updatedAt: connection.updatedAt,
      }));
    });
  }

  async beginConnection(
    principal: Principal,
    providerValue: string,
    returnUrl?: string,
  ) {
    const provider = this.parseProvider(providerValue);
    const credentials = this.credentials(provider);
    if (!credentials.clientId || !credentials.clientSecret) {
      throw new ConflictException(
        `${provider === CalendarProvider.GOOGLE ? 'Google' : 'Microsoft'} Calendar OAuth is not configured`,
      );
    }

    const id = randomUUID();
    const opaque = this.security.createOpaqueToken(id);
    const ttlSeconds = this.config.get<number>('CALENDAR_OAUTH_STATE_TTL_SECONDS', 600);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const safeReturnUrl = this.normalizeReturnUrl(returnUrl);

    await this.database.run(principal, async (transaction) => {
      await transaction.calendarOAuthState.create({
        data: {
          id,
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          userId: principal.userId,
          provider,
          stateHash: opaque.tokenHash,
          returnUrl: safeReturnUrl,
          expiresAt,
        },
      });
      await this.audit.record(transaction, principal, {
        action: 'calendar.oauth.started',
        resourceType: 'calendar_connection',
        resourceId: id,
        metadata: { provider },
      });
    });

    const callbackUrl = this.callbackUrl(provider);
    return {
      provider,
      authorizeUrl: this.authorizationUrl(
        provider,
        credentials.clientId,
        callbackUrl,
        opaque.token,
      ),
      expiresAt: expiresAt.toISOString(),
    };
  }

  async completeConnection(
    providerValue: string,
    stateToken: string,
    code: string,
  ): Promise<{ returnUrl: string; provider: CalendarProvider; connected: true }> {
    const provider = this.parseProvider(providerValue);
    const parsed = this.security.parseOpaqueToken(stateToken);
    if (!parsed) throw new BadRequestException('OAuth state is invalid or expired');

    const result = await this.worker.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${parsed.id}, 0))`;
      const state = await transaction.calendarOAuthState.findUnique({
        where: { id: parsed.id },
      });
      if (
        !state ||
        state.provider !== provider ||
        state.usedAt ||
        state.expiresAt <= new Date() ||
        !this.security.verifyTokenDigest(parsed.secret, state.stateHash)
      ) {
        return { error: 'invalid_state' } as const;
      }

      const membership = await transaction.workspaceMembership.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: state.workspaceId,
            userId: state.userId,
          },
        },
        include: { user: true },
      });
      if (!membership || membership.organizationId !== state.organizationId) {
        return { error: 'workspace_access' } as const;
      }

      const credentials = this.credentials(provider);
      if (!credentials.clientId || !credentials.clientSecret) {
        return { error: 'not_configured' } as const;
      }

      const token = await this.exchangeCode(
        provider,
        code,
        credentials.clientId,
        credentials.clientSecret,
        this.callbackUrl(provider),
      );
      if (!token.access_token) {
        throw new ConflictException(
          token.error_description || token.error || 'Calendar OAuth token exchange failed',
        );
      }

      const profile = await this.fetchProfile(provider, token.access_token);
      const encryptedAccessToken = this.security.encryptSensitiveValue(
        token.access_token,
        `calendar-access:${provider}`,
      );
      const encryptedRefreshToken = token.refresh_token
        ? this.security.encryptSensitiveValue(
            token.refresh_token,
            `calendar-refresh:${provider}`,
          )
        : null;
      const tokenExpiresAt =
        token.expires_in && token.expires_in > 0
          ? new Date(Date.now() + token.expires_in * 1000)
          : null;
      const scopes = (token.scope || '')
        .split(/\s+/)
        .map((scope) => scope.trim())
        .filter(Boolean);

      const connection = await transaction.calendarConnection.upsert({
        where: {
          workspaceId_userId_provider: {
            workspaceId: state.workspaceId,
            userId: state.userId,
            provider,
          },
        },
        update: {
          providerAccountId: profile.id,
          accountEmail: profile.email,
          encryptedAccessToken,
          ...(encryptedRefreshToken ? { encryptedRefreshToken } : {}),
          tokenExpiresAt,
          scopes,
          calendarId: 'primary',
          status: CalendarConnectionStatus.CONNECTED,
          syncEnabled: true,
          lastError: null,
          version: { increment: 1 },
        },
        create: {
          organizationId: state.organizationId,
          workspaceId: state.workspaceId,
          userId: state.userId,
          provider,
          providerAccountId: profile.id,
          accountEmail: profile.email,
          encryptedAccessToken,
          encryptedRefreshToken,
          tokenExpiresAt,
          scopes,
          calendarId: 'primary',
          status: CalendarConnectionStatus.CONNECTED,
          syncEnabled: true,
        },
      });

      await transaction.calendarOAuthState.update({
        where: { id: state.id },
        data: { usedAt: new Date() },
      });

      const principal: Principal = {
        userId: membership.userId,
        organizationId: membership.organizationId,
        workspaceId: membership.workspaceId,
        email: membership.user.email,
        displayName: membership.user.displayName,
        roles: [membership.role as WorkspaceRole],
      };
      await this.audit.record(transaction, principal, {
        action: 'calendar.connected',
        resourceType: 'calendar_connection',
        resourceId: connection.id,
        metadata: {
          provider,
          accountEmail: connection.accountEmail,
        },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'calendar_connection',
        aggregateId: connection.id,
        eventType: 'calendar.connected',
        payload: {
          connectionId: connection.id,
          provider,
          accountEmail: connection.accountEmail,
        },
      });

      return {
        returnUrl: state.returnUrl || this.defaultReturnUrl(),
        provider,
      } as const;
    });

    if ('error' in result) {
      if (result.error === 'workspace_access') {
        throw new ConflictException('Workspace access is no longer available');
      }
      if (result.error === 'not_configured') {
        throw new ConflictException('Calendar OAuth provider is not configured');
      }
      throw new BadRequestException('OAuth state is invalid or expired');
    }

    return { ...result, connected: true };
  }

  async disconnect(principal: Principal, providerValue: string) {
    const provider = this.parseProvider(providerValue);
    return this.database.run(principal, async (transaction) => {
      const connection = await transaction.calendarConnection.findUnique({
        where: {
          workspaceId_userId_provider: {
            workspaceId: principal.workspaceId,
            userId: principal.userId,
            provider,
          },
        },
      });
      if (!connection) throw new NotFoundException('Calendar connection not found');
      await transaction.calendarConnection.delete({ where: { id: connection.id } });
      await this.audit.record(transaction, principal, {
        action: 'calendar.disconnected',
        resourceType: 'calendar_connection',
        resourceId: connection.id,
        metadata: { provider },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'calendar_connection',
        aggregateId: connection.id,
        eventType: 'calendar.disconnected',
        payload: { connectionId: connection.id, provider },
      });
      return { provider, disconnected: true as const };
    });
  }

  private parseProvider(value: string): CalendarProvider {
    const normalized = value.trim().toUpperCase();
    if (normalized === CalendarProvider.GOOGLE) return CalendarProvider.GOOGLE;
    if (normalized === CalendarProvider.MICROSOFT) return CalendarProvider.MICROSOFT;
    throw new BadRequestException('Unsupported calendar provider');
  }

  private credentials(provider: CalendarProvider) {
    if (provider === CalendarProvider.GOOGLE) {
      return {
        clientId: this.config.get<string>('GOOGLE_CALENDAR_CLIENT_ID'),
        clientSecret: this.config.get<string>('GOOGLE_CALENDAR_CLIENT_SECRET'),
      };
    }
    return {
      clientId: this.config.get<string>('MICROSOFT_CALENDAR_CLIENT_ID'),
      clientSecret: this.config.get<string>('MICROSOFT_CALENDAR_CLIENT_SECRET'),
    };
  }

  private callbackUrl(provider: CalendarProvider): string {
    const base = this.config.getOrThrow<string>('PUBLIC_API_URL').replace(/\/$/, '');
    return `${base}/v1/calendar-integrations/oauth/${provider.toLowerCase()}/callback`;
  }

  private authorizationUrl(
    provider: CalendarProvider,
    clientId: string,
    redirectUri: string,
    state: string,
  ): string {
    if (provider === CalendarProvider.GOOGLE) {
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'true',
        scope: [
          'openid',
          'email',
          'https://www.googleapis.com/auth/calendar.readonly',
          'https://www.googleapis.com/auth/calendar.events',
        ].join(' '),
        state,
      });
      return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    }
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      response_mode: 'query',
      scope: ['offline_access', 'User.Read', 'Calendars.ReadWrite'].join(' '),
      state,
    });
    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
  }

  private async exchangeCode(
    provider: CalendarProvider,
    code: string,
    clientId: string,
    clientSecret: string,
    redirectUri: string,
  ): Promise<TokenResponse> {
    const endpoint =
      provider === CalendarProvider.GOOGLE
        ? 'https://oauth2.googleapis.com/token'
        : 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    const payload = (await response.json().catch(() => ({}))) as TokenResponse;
    if (!response.ok) {
      throw new ConflictException(
        payload.error_description || payload.error || 'Calendar OAuth token exchange failed',
      );
    }
    return payload;
  }

  private async fetchProfile(
    provider: CalendarProvider,
    accessToken: string,
  ): Promise<{ id: string | null; email: string | null }> {
    const endpoint =
      provider === CalendarProvider.GOOGLE
        ? 'https://www.googleapis.com/oauth2/v2/userinfo'
        : 'https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName';
    const response = await fetch(endpoint, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return { id: null, email: null };
    const payload = (await response.json()) as Record<string, unknown>;
    return {
      id: typeof payload.id === 'string' ? payload.id : null,
      email:
        typeof payload.email === 'string'
          ? payload.email
          : typeof payload.mail === 'string'
            ? payload.mail
            : typeof payload.userPrincipalName === 'string'
              ? payload.userPrincipalName
              : null,
    };
  }

  private normalizeReturnUrl(value?: string): string {
    if (!value) return this.defaultReturnUrl();
    let candidate: URL;
    try {
      candidate = new URL(value);
    } catch {
      throw new BadRequestException('returnUrl must be a valid absolute URL');
    }
    const allowedOrigins = (this.config.get<string>('CORS_ORIGINS') || '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
    if (!allowedOrigins.includes(candidate.origin)) {
      throw new BadRequestException('returnUrl origin is not allowed');
    }
    return candidate.toString();
  }

  private defaultReturnUrl(): string {
    const origin = (this.config.get<string>('CORS_ORIGINS') || 'http://localhost:3000')
      .split(',')[0]
      ?.trim() || 'http://localhost:3000';
    return `${origin}/settings?tab=integrations`;
  }
}
