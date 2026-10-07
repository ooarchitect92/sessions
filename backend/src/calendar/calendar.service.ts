import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CalendarConnectionStatus,
  CalendarProvider,
  Prisma,
} from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { HOST_ROLES, hasAnyRole, type Principal } from '../common/auth/principal';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { WorkerPrismaService } from '../database/worker-prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import {
  CalendarProviderClientService,
  type BusyInterval,
} from './calendar-provider-client.service';
import { CalendarTokenVaultService } from './calendar-token-vault.service';
import { UpdateCalendarConnectionDto } from './dto/update-calendar-connection.dto';

type ConnectionRecord = {
  id: string;
  organizationId: string;
  workspaceId: string;
  userId: string;
  provider: CalendarProvider;
  status: CalendarConnectionStatus;
  externalAccountId: string | null;
  externalAccountEmail: string | null;
  calendarId: string;
  encryptedAccessToken: string;
  encryptedRefreshToken: string | null;
  tokenExpiresAt: Date | null;
  scopes: string[];
  syncEnabled: boolean;
  lastSyncAt: Date | null;
  lastError: string | null;
};

@Injectable()
export class CalendarService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly workerDatabase: WorkerPrismaService,
    private readonly providers: CalendarProviderClientService,
    private readonly vault: CalendarTokenVaultService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly config: ConfigService,
  ) {}

  async list(principal: Principal) {
    return this.database.run(principal, async (transaction) => {
      const connections = await transaction.calendarConnection.findMany({
        where: { userId: principal.userId },
        orderBy: { provider: 'asc' },
      });
      return connections.map((connection) => this.publicConnection(connection));
    });
  }

  async startOAuth(principal: Principal, provider: CalendarProvider) {
    this.assertHost(principal);
    this.assertProviderConfigured(provider);

    const state = randomBytes(32).toString('base64url');
    const stateHash = this.hash(state);
    const redirectUri = this.callbackUri(provider);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.database.run(principal, async (transaction) => {
      await transaction.calendarOAuthState.deleteMany({
        where: {
          userId: principal.userId,
          provider,
          OR: [{ expiresAt: { lt: new Date() } }, { consumedAt: { not: null } }],
        },
      });
      await transaction.calendarOAuthState.create({
        data: {
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          userId: principal.userId,
          provider,
          stateHash,
          redirectUri,
          expiresAt,
        },
      });
      await this.audit.record(transaction, principal, {
        action: 'calendar.oauth.started',
        resourceType: 'calendar_connection',
        resourceId: principal.userId,
        metadata: { provider, expiresAt },
      });
    });

    return {
      provider,
      authorizationUrl: this.providers.buildAuthorizationUrl(
        provider,
        state,
        redirectUri,
      ),
      expiresAt,
    };
  }

  async completeOAuth(
    provider: CalendarProvider,
    code: string,
    state: string,
  ) {
    this.assertProviderConfigured(provider);
    const stateHash = this.hash(state);
    const attempt = await this.workerDatabase.calendarOAuthState.findUnique({
      where: { stateHash },
    });
    if (
      !attempt ||
      attempt.provider !== provider ||
      attempt.consumedAt ||
      attempt.expiresAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException('Calendar OAuth state is invalid or expired');
    }

    const tokenSet = await this.providers.exchangeCode(
      provider,
      code,
      attempt.redirectUri,
    );
    const profile = await this.providers.getProfile(
      provider,
      tokenSet.accessToken,
    );

    const result = await this.workerDatabase.$transaction(
      async (transaction) => {
        const consumed = await transaction.calendarOAuthState.updateMany({
          where: {
            id: attempt.id,
            consumedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: { consumedAt: new Date() },
        });
        if (consumed.count !== 1) {
          throw new ConflictException('Calendar OAuth state was already consumed');
        }

        const existing = await transaction.calendarConnection.findUnique({
          where: {
            workspaceId_userId_provider: {
              workspaceId: attempt.workspaceId,
              userId: attempt.userId,
              provider,
            },
          },
        });

        const connection = await transaction.calendarConnection.upsert({
          where: {
            workspaceId_userId_provider: {
              workspaceId: attempt.workspaceId,
              userId: attempt.userId,
              provider,
            },
          },
          update: {
            status: CalendarConnectionStatus.ACTIVE,
            externalAccountId: profile.id ?? existing?.externalAccountId ?? null,
            externalAccountEmail:
              profile.email?.toLowerCase() ??
              existing?.externalAccountEmail ??
              null,
            encryptedAccessToken: this.vault.encrypt(tokenSet.accessToken),
            encryptedRefreshToken: tokenSet.refreshToken
              ? this.vault.encrypt(tokenSet.refreshToken)
              : existing?.encryptedRefreshToken ?? null,
            tokenExpiresAt: tokenSet.expiresAt ?? null,
            scopes:
              tokenSet.scopes.length > 0
                ? tokenSet.scopes
                : existing?.scopes ?? [],
            lastError: null,
          },
          create: {
            organizationId: attempt.organizationId,
            workspaceId: attempt.workspaceId,
            userId: attempt.userId,
            provider,
            externalAccountId: profile.id ?? null,
            externalAccountEmail: profile.email?.toLowerCase() ?? null,
            encryptedAccessToken: this.vault.encrypt(tokenSet.accessToken),
            encryptedRefreshToken: tokenSet.refreshToken
              ? this.vault.encrypt(tokenSet.refreshToken)
              : null,
            tokenExpiresAt: tokenSet.expiresAt ?? null,
            scopes: tokenSet.scopes,
          },
        });

        await this.outbox.enqueue(
          transaction,
          {
            organizationId: attempt.organizationId,
            workspaceId: attempt.workspaceId,
          },
          {
            aggregateType: 'calendar_connection',
            aggregateId: connection.id,
            eventType: 'calendar.connected',
            payload: this.json({
              calendarConnectionId: connection.id,
              provider,
              userId: connection.userId,
            }),
          },
        );

        return this.publicConnection(connection);
      },
    );

    return result;
  }

  async update(
    principal: Principal,
    connectionId: string,
    input: UpdateCalendarConnectionDto,
  ) {
    this.assertHost(principal);
    return this.database.run(principal, async (transaction) => {
      const connection = await transaction.calendarConnection.findFirst({
        where: { id: connectionId, userId: principal.userId },
      });
      if (!connection) {
        throw new NotFoundException('Calendar connection not found');
      }
      const updated = await transaction.calendarConnection.update({
        where: { id: connection.id },
        data: {
          ...(input.syncEnabled !== undefined
            ? { syncEnabled: input.syncEnabled }
            : {}),
          ...(input.calendarId !== undefined
            ? { calendarId: input.calendarId.trim() }
            : {}),
          lastError: null,
        },
      });
      await this.audit.record(transaction, principal, {
        action: 'calendar.connection.updated',
        resourceType: 'calendar_connection',
        resourceId: updated.id,
        metadata: {
          provider: updated.provider,
          syncEnabled: updated.syncEnabled,
          calendarId: updated.calendarId,
        },
      });
      return this.publicConnection(updated);
    });
  }

  async disconnect(principal: Principal, connectionId: string) {
    this.assertHost(principal);
    return this.database.run(principal, async (transaction) => {
      const connection = await transaction.calendarConnection.findFirst({
        where: { id: connectionId, userId: principal.userId },
      });
      if (!connection) {
        throw new NotFoundException('Calendar connection not found');
      }
      const updated = await transaction.calendarConnection.update({
        where: { id: connection.id },
        data: {
          status: CalendarConnectionStatus.REVOKED,
          syncEnabled: false,
          encryptedAccessToken: this.vault.encrypt('revoked'),
          encryptedRefreshToken: null,
          tokenExpiresAt: null,
        },
      });
      await this.audit.record(transaction, principal, {
        action: 'calendar.disconnected',
        resourceType: 'calendar_connection',
        resourceId: updated.id,
        metadata: { provider: updated.provider },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'calendar_connection',
        aggregateId: updated.id,
        eventType: 'calendar.disconnected',
        payload: this.json({
          calendarConnectionId: updated.id,
          provider: updated.provider,
        }),
      });
      return this.publicConnection(updated);
    });
  }

  async busyForUser(
    organizationId: string,
    workspaceId: string,
    userId: string,
    timeMin: Date,
    timeMax: Date,
  ): Promise<BusyInterval[]> {
    const connections = await this.workerDatabase.calendarConnection.findMany({
      where: {
        organizationId,
        workspaceId,
        userId,
        status: CalendarConnectionStatus.ACTIVE,
        syncEnabled: true,
      },
    });

    const intervals: BusyInterval[] = [];
    let syncFailed = false;
    for (const connection of connections) {
      try {
        const ready = await this.ensureAccessToken(connection);
        const busy = await this.providers.listBusy(
          ready.provider,
          ready.accessToken,
          ready.calendarId,
          ready.externalAccountEmail,
          timeMin,
          timeMax,
        );
        intervals.push(...busy);
        await this.workerDatabase.calendarConnection.update({
          where: { id: connection.id },
          data: {
            lastSyncAt: new Date(),
            lastError: null,
            status: CalendarConnectionStatus.ACTIVE,
          },
        });
      } catch (error: unknown) {
        syncFailed = true;
        await this.workerDatabase.calendarConnection.update({
          where: { id: connection.id },
          data: {
            status: CalendarConnectionStatus.ERROR,
            lastError:
              error instanceof Error
                ? error.message.slice(0, 500)
                : 'calendar_sync_failed',
          },
        });
      }
    }

    if (syncFailed) {
      throw new ServiceUnavailableException(
        'Connected calendar availability could not be verified. Try again shortly.',
      );
    }

    return intervals;
  }

  private async ensureAccessToken(connection: ConnectionRecord) {
    const accessToken = this.vault.decrypt(connection.encryptedAccessToken);
    if (
      !connection.tokenExpiresAt ||
      connection.tokenExpiresAt.getTime() > Date.now() + 60_000
    ) {
      return { ...connection, accessToken };
    }
    if (!connection.encryptedRefreshToken) {
      throw new Error('calendar_refresh_token_missing');
    }

    const refreshToken = this.vault.decrypt(connection.encryptedRefreshToken);
    const refreshed = await this.providers.refresh(
      connection.provider,
      refreshToken,
    );
    const updated = await this.workerDatabase.calendarConnection.update({
      where: { id: connection.id },
      data: {
        encryptedAccessToken: this.vault.encrypt(refreshed.accessToken),
        encryptedRefreshToken: refreshed.refreshToken
          ? this.vault.encrypt(refreshed.refreshToken)
          : connection.encryptedRefreshToken,
        tokenExpiresAt: refreshed.expiresAt ?? null,
        scopes:
          refreshed.scopes.length > 0
            ? refreshed.scopes
            : connection.scopes,
        status: CalendarConnectionStatus.ACTIVE,
        lastError: null,
      },
    });
    return {
      ...updated,
      accessToken: refreshed.accessToken,
    };
  }

  callbackUri(provider: CalendarProvider): string {
    const base = this.config
      .getOrThrow<string>('PUBLIC_API_URL')
      .replace(/\/$/, '');
    return `${base}/v1/calendar/oauth/${provider.toLowerCase()}/callback`;
  }

  successRedirect(provider: CalendarProvider): string {
    const base = this.config
      .get<string>('WEB_APP_URL', 'http://localhost:3000')
      .replace(/\/$/, '');
    return `${base}/settings?tab=integrations&calendar=${provider.toLowerCase()}-connected`;
  }

  failureRedirect(provider: CalendarProvider, code: string): string {
    const base = this.config
      .get<string>('WEB_APP_URL', 'http://localhost:3000')
      .replace(/\/$/, '');
    return `${base}/settings?tab=integrations&calendar=${provider.toLowerCase()}-error&reason=${encodeURIComponent(code)}`;
  }

  parseProvider(value: string): CalendarProvider {
    const normalized = value.toUpperCase();
    if (
      normalized !== CalendarProvider.GOOGLE &&
      normalized !== CalendarProvider.MICROSOFT
    ) {
      throw new BadRequestException('Unsupported calendar provider');
    }
    return normalized as CalendarProvider;
  }

  private publicConnection(connection: {
    id: string;
    provider: CalendarProvider;
    status: CalendarConnectionStatus;
    externalAccountEmail: string | null;
    calendarId: string;
    scopes: string[];
    syncEnabled: boolean;
    lastSyncAt: Date | null;
    lastError: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: connection.id,
      provider: connection.provider,
      status: connection.status,
      externalAccountEmail: connection.externalAccountEmail,
      calendarId: connection.calendarId,
      scopes: connection.scopes,
      syncEnabled: connection.syncEnabled,
      lastSyncAt: connection.lastSyncAt,
      lastError: connection.lastError,
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
    };
  }

  private assertProviderConfigured(provider: CalendarProvider): void {
    const prefix =
      provider === CalendarProvider.GOOGLE
        ? 'GOOGLE_CALENDAR'
        : 'MICROSOFT_CALENDAR';
    if (
      !this.config.get<string>(`${prefix}_CLIENT_ID`) ||
      !this.config.get<string>(`${prefix}_CLIENT_SECRET`)
    ) {
      throw new ConflictException(
        `${provider.toLowerCase()} calendar integration is not configured`,
      );
    }
  }

  private assertHost(principal: Principal): void {
    if (!hasAnyRole(principal, HOST_ROLES)) {
      throw new ForbiddenException('A host role is required');
    }
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private json(value: unknown): Prisma.InputJsonObject {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
  }
}
