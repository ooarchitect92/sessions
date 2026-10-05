import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import {
  CalendarConnectionStatus,
  CalendarProvider,
  Prisma,
  type CalendarConnection,
} from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { ADMIN_ROLES, hasAnyRole, type Principal } from '../common/auth/principal';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { WorkerPrismaService } from '../database/worker-prisma.service';
import { RedisService } from '../infrastructure/redis.service';
import { OutboxService } from '../outbox/outbox.service';
import { CalendarCryptoService } from './calendar-crypto.service';
import { CalendarProviderService } from './calendar-provider.service';

interface OauthState {
  provider: CalendarProvider;
  userId: string;
  organizationId: string;
  workspaceId: string;
  email: string;
  displayName: string;
  codeVerifier: string;
}

@Injectable()
export class CalendarIntegrationsService {
  constructor(
    private readonly config: ConfigService,
    private readonly database: TenantDatabaseService,
    private readonly workerPrisma: WorkerPrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly crypto: CalendarCryptoService,
    private readonly providers: CalendarProviderService,
  ) {}

  async startOauth(principal: Principal, provider: CalendarProvider) {
    if (!this.config.get<boolean>('CALENDAR_INTEGRATIONS_ENABLED')) {
      throw new ServiceUnavailableException('Calendar integrations are disabled');
    }

    const state = randomBytes(32).toString('base64url');
    const codeVerifier = randomBytes(48).toString('base64url');
    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    const payload: OauthState = {
      provider,
      userId: principal.userId,
      organizationId: principal.organizationId,
      workspaceId: principal.workspaceId,
      email: principal.email,
      displayName: principal.displayName,
      codeVerifier,
    };
    await this.redis.set(
      this.oauthStateKey(state),
      JSON.stringify(payload),
      'EX',
      600,
      'NX',
    );

    return {
      provider,
      authorizationUrl: this.providers.authorizationUrl(
        provider,
        state,
        codeChallenge,
      ),
      expiresIn: 600,
    };
  }

  async completeOauth(
    provider: CalendarProvider,
    state: string,
    code: string,
  ): Promise<{ connectionId: string; provider: CalendarProvider }> {
    const key = this.oauthStateKey(state);
    const serialized = await this.redis.get(key);
    if (!serialized) {
      throw new BadRequestException('Calendar OAuth state is invalid or expired');
    }
    await this.redis.del(key);

    let oauthState: OauthState;
    try {
      oauthState = JSON.parse(serialized) as OauthState;
    } catch {
      throw new BadRequestException('Calendar OAuth state is invalid');
    }
    if (oauthState.provider !== provider) {
      throw new BadRequestException('Calendar OAuth provider does not match state');
    }

    const membership = await this.workerPrisma.workspaceMembership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: oauthState.workspaceId,
          userId: oauthState.userId,
        },
      },
      select: { role: true, organizationId: true },
    });
    if (
      !membership ||
      membership.organizationId !== oauthState.organizationId
    ) {
      throw new ForbiddenException('Workspace access no longer exists');
    }

    const tokenSet = await this.providers.exchangeCode(
      provider,
      code,
      oauthState.codeVerifier,
    );
    const identity = await this.providers.identity(provider, tokenSet.accessToken);
    const principal: Principal = {
      userId: oauthState.userId,
      organizationId: oauthState.organizationId,
      workspaceId: oauthState.workspaceId,
      email: oauthState.email,
      displayName: oauthState.displayName,
      roles: [membership.role],
    };

    const connection = await this.database.run(
      principal,
      async (transaction) => {
        const existing = await transaction.calendarConnection.findUnique({
          where: {
            workspaceId_userId_provider: {
              workspaceId: principal.workspaceId,
              userId: principal.userId,
              provider,
            },
          },
        });
        const id = existing?.id ?? randomUUID();
        const accessTokenEncrypted = this.crypto.encrypt(
          id,
          'access',
          tokenSet.accessToken,
        );
        const refreshTokenEncrypted = tokenSet.refreshToken
          ? this.crypto.encrypt(id, 'refresh', tokenSet.refreshToken)
          : existing?.refreshTokenEncrypted ?? null;
        const calendarIds =
          provider === CalendarProvider.GOOGLE
            ? ['primary']
            : identity.email
              ? [identity.email]
              : [];

        const saved = existing
          ? await transaction.calendarConnection.update({
              where: { id },
              data: {
                status: CalendarConnectionStatus.ACTIVE,
                providerAccountId: identity.id,
                accountEmail: identity.email,
                accessTokenEncrypted,
                refreshTokenEncrypted,
                accessTokenExpiresAt: tokenSet.expiresAt ?? null,
                scopes: tokenSet.scopes,
                calendarIds,
                lastError: null,
                version: { increment: 1 },
              },
            })
          : await transaction.calendarConnection.create({
              data: {
                id,
                organizationId: principal.organizationId,
                workspaceId: principal.workspaceId,
                userId: principal.userId,
                provider,
                providerAccountId: identity.id,
                accountEmail: identity.email,
                accessTokenEncrypted,
                refreshTokenEncrypted,
                accessTokenExpiresAt: tokenSet.expiresAt ?? null,
                scopes: tokenSet.scopes,
                calendarIds,
              },
            });

        await this.audit.record(transaction, principal, {
          action: 'calendar.connection.connected',
          resourceType: 'calendar_connection',
          resourceId: saved.id,
          metadata: {
            provider,
            accountEmail: identity.email,
          },
        });
        await this.outbox.enqueue(transaction, principal, {
          aggregateType: 'calendar_connection',
          aggregateId: saved.id,
          eventType: 'calendar.connection.connected',
          payload: {
            id: saved.id,
            provider,
            accountEmail: identity.email,
          },
        });
        return saved;
      },
    );

    try {
      await this.syncRecord(
        connection,
        new Date(Date.now() - 24 * 60 * 60 * 1000),
        new Date(
          Date.now() +
            this.config.get<number>('CALENDAR_SYNC_HORIZON_DAYS', 60) *
              86_400_000,
        ),
      );
    } catch {
      // Connection remains visible with sync error/reauth state for explicit recovery.
    }

    return { connectionId: connection.id, provider };
  }

  async list(principal: Principal) {
    return this.database.run(principal, async (transaction) => {
      const rows = await transaction.calendarConnection.findMany({
        where: hasAnyRole(principal, ADMIN_ROLES)
          ? {}
          : { userId: principal.userId },
        orderBy: [{ userId: 'asc' }, { provider: 'asc' }],
        select: {
          id: true,
          userId: true,
          provider: true,
          status: true,
          accountEmail: true,
          scopes: true,
          calendarIds: true,
          lastSyncedAt: true,
          lastError: true,
          version: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: { id: true, displayName: true, email: true },
          },
          _count: { select: { busyBlocks: true } },
        },
      });
      return rows.map((row) => ({
        ...row,
        busyBlockCount: row._count.busyBlocks,
        _count: undefined,
      }));
    });
  }

  async sync(principal: Principal, id: string) {
    const connection = await this.database.run(principal, async (transaction) => {
      const row = await transaction.calendarConnection.findUnique({
        where: { id },
      });
      if (!row) throw new NotFoundException('Calendar connection not found');
      if (
        row.userId !== principal.userId &&
        !hasAnyRole(principal, ADMIN_ROLES)
      ) {
        throw new ForbiddenException('You cannot sync this calendar connection');
      }
      return row;
    });

    return this.syncRecord(
      connection,
      new Date(Date.now() - 24 * 60 * 60 * 1000),
      new Date(
        Date.now() +
          this.config.get<number>('CALENDAR_SYNC_HORIZON_DAYS', 60) *
            86_400_000,
      ),
    );
  }

  async disconnect(principal: Principal, id: string) {
    return this.database.run(principal, async (transaction) => {
      const existing = await transaction.calendarConnection.findUnique({
        where: { id },
      });
      if (!existing) throw new NotFoundException('Calendar connection not found');
      if (
        existing.userId !== principal.userId &&
        !hasAnyRole(principal, ADMIN_ROLES)
      ) {
        throw new ForbiddenException('You cannot disconnect this calendar connection');
      }
      await transaction.calendarBusyBlock.deleteMany({
        where: { calendarConnectionId: id },
      });
      const updated = await transaction.calendarConnection.update({
        where: { id },
        data: {
          status: CalendarConnectionStatus.REVOKED,
          accessTokenEncrypted: '',
          refreshTokenEncrypted: null,
          accessTokenExpiresAt: null,
          lastError: null,
          version: { increment: 1 },
        },
      });
      await this.audit.record(transaction, principal, {
        action: 'calendar.connection.disconnected',
        resourceType: 'calendar_connection',
        resourceId: id,
        metadata: { provider: existing.provider },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'calendar_connection',
        aggregateId: id,
        eventType: 'calendar.connection.disconnected',
        payload: { id, provider: existing.provider },
      });
      return {
        id: updated.id,
        provider: updated.provider,
        status: updated.status,
      };
    });
  }

  async ensureFreshUserBusy(
    workspaceId: string,
    userId: string,
    startsAt: Date,
    endsAt: Date,
  ): Promise<Array<{ startsAt: Date; endsAt: Date }>> {
    if (!this.config.get<boolean>('CALENDAR_INTEGRATIONS_ENABLED')) return [];

    const connections = await this.workerPrisma.calendarConnection.findMany({
      where: {
        workspaceId,
        userId,
        status: CalendarConnectionStatus.ACTIVE,
      },
    });
    const staleBefore =
      Date.now() -
      this.config.get<number>('CALENDAR_BUSY_MAX_AGE_SECONDS', 300) * 1000;

    for (const connection of connections) {
      if (
        !connection.lastSyncedAt ||
        connection.lastSyncedAt.getTime() < staleBefore
      ) {
        try {
          await this.syncRecord(connection, startsAt, endsAt);
        } catch {
          throw new ServiceUnavailableException(
            'Calendar availability could not be refreshed safely. Please try again.',
          );
        }
      }
    }

    return this.workerPrisma.calendarBusyBlock.findMany({
      where: {
        workspaceId,
        calendarConnection: {
          userId,
          status: CalendarConnectionStatus.ACTIVE,
        },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
      select: { startsAt: true, endsAt: true },
    });
  }

  @Interval(300_000)
  async scheduledSync(): Promise<void> {
    if (!this.config.get<boolean>('CALENDAR_INTEGRATIONS_ENABLED')) return;
    const staleBefore = new Date(
      Date.now() -
        this.config.get<number>('CALENDAR_BUSY_MAX_AGE_SECONDS', 300) * 1000,
    );
    const connections = await this.workerPrisma.calendarConnection.findMany({
      where: {
        status: CalendarConnectionStatus.ACTIVE,
        OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: staleBefore } }],
      },
      take: 100,
    });

    const startsAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const endsAt = new Date(
      Date.now() +
        this.config.get<number>('CALENDAR_SYNC_HORIZON_DAYS', 60) * 86_400_000,
    );
    for (const connection of connections) {
      try {
        await this.syncRecord(connection, startsAt, endsAt);
      } catch {
        // Error state is persisted by syncRecord; continue with other tenants.
      }
    }
  }

  private async syncRecord(
    connection: CalendarConnection,
    startsAt: Date,
    endsAt: Date,
  ) {
    if (connection.status !== CalendarConnectionStatus.ACTIVE) {
      throw new ServiceUnavailableException('Calendar connection is not active');
    }

    try {
      let accessToken = this.crypto.decrypt(
        connection.id,
        'access',
        connection.accessTokenEncrypted,
      );
      let refreshToken = connection.refreshTokenEncrypted
        ? this.crypto.decrypt(
            connection.id,
            'refresh',
            connection.refreshTokenEncrypted,
          )
        : undefined;
      let accessTokenExpiresAt = connection.accessTokenExpiresAt;

      if (
        accessTokenExpiresAt &&
        accessTokenExpiresAt.getTime() <= Date.now() + 120_000
      ) {
        if (!refreshToken) {
          await this.markConnectionError(
            connection.id,
            CalendarConnectionStatus.REAUTH_REQUIRED,
            'Provider refresh token is unavailable',
          );
          throw new ServiceUnavailableException('Calendar reauthorization is required');
        }
        const refreshed = await this.providers.refreshToken(
          connection.provider,
          refreshToken,
        );
        accessToken = refreshed.accessToken;
        refreshToken = refreshed.refreshToken ?? refreshToken;
        accessTokenExpiresAt = refreshed.expiresAt ?? null;
        await this.workerPrisma.calendarConnection.update({
          where: { id: connection.id },
          data: {
            accessTokenEncrypted: this.crypto.encrypt(
              connection.id,
              'access',
              accessToken,
            ),
            refreshTokenEncrypted: refreshToken
              ? this.crypto.encrypt(connection.id, 'refresh', refreshToken)
              : connection.refreshTokenEncrypted,
            accessTokenExpiresAt,
            ...(refreshed.scopes.length
              ? { scopes: refreshed.scopes }
              : {}),
          },
        });
      }

      const calendarIds = Array.isArray(connection.calendarIds)
        ? connection.calendarIds.filter(
            (value): value is string => typeof value === 'string',
          )
        : [];
      const busy = await this.providers.busy(
        connection.provider,
        accessToken,
        connection.accountEmail,
        calendarIds,
        startsAt,
        endsAt,
      );
      const fetchedAt = new Date();

      await this.workerPrisma.$transaction(async (transaction) => {
        await transaction.calendarBusyBlock.deleteMany({
          where: {
            calendarConnectionId: connection.id,
            startsAt: { lt: endsAt },
            endsAt: { gt: startsAt },
          },
        });
        if (busy.length) {
          await transaction.calendarBusyBlock.createMany({
            data: busy.map((item) => ({
              organizationId: connection.organizationId,
              workspaceId: connection.workspaceId,
              calendarConnectionId: connection.id,
              providerEventId: item.providerEventId ?? null,
              startsAt: item.startsAt,
              endsAt: item.endsAt,
              fetchedAt,
            })),
          });
        }
        await transaction.calendarConnection.update({
          where: { id: connection.id },
          data: {
            status: CalendarConnectionStatus.ACTIVE,
            lastSyncedAt: fetchedAt,
            lastError: null,
          },
        });
      });

      return {
        id: connection.id,
        provider: connection.provider,
        status: CalendarConnectionStatus.ACTIVE,
        busyBlockCount: busy.length,
        lastSyncedAt: fetchedAt.toISOString(),
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message.slice(0, 1000) : 'Calendar sync failed';
      const current = await this.workerPrisma.calendarConnection.findUnique({
        where: { id: connection.id },
        select: { status: true },
      });
      if (current?.status === CalendarConnectionStatus.ACTIVE) {
        await this.markConnectionError(
          connection.id,
          CalendarConnectionStatus.ERROR,
          message,
        );
      }
      throw error;
    }
  }

  private async markConnectionError(
    id: string,
    status: CalendarConnectionStatus,
    message: string,
  ): Promise<void> {
    await this.workerPrisma.calendarConnection.update({
      where: { id },
      data: {
        status,
        lastError: message,
      },
    });
  }

  private oauthStateKey(state: string): string {
    return `calendar-oauth:v1:${state}`;
  }
}
