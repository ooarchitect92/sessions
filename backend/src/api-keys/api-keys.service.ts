import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, UserStatus, WorkspaceRole } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { SecurityService } from '../auth/security.service';
import {
  ADMIN_ROLES,
  hasAnyRole,
  type Principal,
} from '../common/auth/principal';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { WorkerPrismaService } from '../database/worker-prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

const ALLOWED_API_KEY_ROLES: WorkspaceRole[] = [
  WorkspaceRole.HOST,
  WorkspaceRole.MEMBER,
  WorkspaceRole.ANALYST,
];

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly prisma: WorkerPrismaService,
    private readonly security: SecurityService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async list(principal: Principal) {
    this.assertAdmin(principal);
    return this.database.run(principal, async (transaction) => {
      const keys = await transaction.apiKey.findMany({
        orderBy: { createdAt: 'desc' },
      });
      return keys.map((key) => this.safeKey(key));
    });
  }

  async create(principal: Principal, body: CreateApiKeyDto) {
    this.assertAdmin(principal);
    if (!ALLOWED_API_KEY_ROLES.includes(body.role)) {
      throw new BadRequestException(
        'API key role must be HOST, MEMBER, or ANALYST',
      );
    }

    const scopes = this.normalizeScopes(body.scopes);
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    if (expiresAt && expiresAt <= new Date()) {
      throw new BadRequestException('API key expiry must be in the future');
    }

    const id = randomUUID();
    const secret = randomBytes(32).toString('base64url');
    const token = `sk_sessions_${id}.${secret}`;
    const prefix = `sk_sessions_${id.slice(0, 8)}`;

    const created = await this.database.run(principal, async (transaction) => {
      const key = await transaction.apiKey.create({
        data: {
          id,
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          createdByUserId: principal.userId,
          name: body.name.trim(),
          tokenPrefix: prefix,
          tokenHash: this.security.digestToken(secret),
          role: body.role,
          scopes,
          expiresAt,
        },
      });
      await this.audit.record(transaction, principal, {
        action: 'api_key.created',
        resourceType: 'api_key',
        resourceId: key.id,
        metadata: {
          name: key.name,
          role: key.role,
          scopes,
          expiresAt: key.expiresAt?.toISOString() ?? null,
        },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'api_key',
        aggregateId: key.id,
        eventType: 'api_key.created',
        payload: {
          apiKeyId: key.id,
          name: key.name,
          role: key.role,
          scopes,
        },
      });
      return key;
    });

    return {
      ...this.safeKey(created),
      token,
      tokenWarning: 'Store this API key now. It will not be shown again.',
    };
  }

  async revoke(principal: Principal, id: string) {
    this.assertAdmin(principal);
    return this.database.run(principal, async (transaction) => {
      const key = await transaction.apiKey.findUnique({ where: { id } });
      if (!key) throw new NotFoundException('API key not found');
      if (key.revokedAt) {
        return { ...this.safeKey(key), revoked: true as const };
      }

      const revoked = await transaction.apiKey.update({
        where: { id },
        data: { revokedAt: new Date() },
      });
      await this.audit.record(transaction, principal, {
        action: 'api_key.revoked',
        resourceType: 'api_key',
        resourceId: id,
        metadata: { name: revoked.name },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'api_key',
        aggregateId: id,
        eventType: 'api_key.revoked',
        payload: { apiKeyId: id, name: revoked.name },
      });
      return { ...this.safeKey(revoked), revoked: true as const };
    });
  }

  async resolveBearerToken(token: string): Promise<Principal> {
    const parsed = this.parseToken(token);
    if (!parsed) throw new UnauthorizedException('The API key is invalid');

    const key = await this.prisma.apiKey.findUnique({
      where: { id: parsed.id },
      include: { createdBy: true },
    });
    if (
      !key ||
      key.revokedAt ||
      (key.expiresAt && key.expiresAt <= new Date()) ||
      key.createdBy.status !== UserStatus.ACTIVE ||
      !this.security.verifyTokenDigest(parsed.secret, key.tokenHash)
    ) {
      throw new UnauthorizedException('The API key is invalid or expired');
    }

    const membership = await this.prisma.workspaceMembership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: key.workspaceId,
          userId: key.createdByUserId,
        },
      },
    });
    if (!membership || membership.organizationId !== key.organizationId) {
      throw new UnauthorizedException('The API key workspace is unavailable');
    }

    await this.prisma.apiKey.update({
      where: { id: key.id },
      data: { lastUsedAt: new Date() },
    });

    return {
      userId: key.createdByUserId,
      organizationId: key.organizationId,
      workspaceId: key.workspaceId,
      email: key.createdBy.email,
      displayName: key.createdBy.displayName,
      roles: [key.role],
      authType: 'API_KEY',
      apiKeyId: key.id,
      apiKeyScopes: this.scopes(key.scopes),
    };
  }

  private parseToken(token: string): { id: string; secret: string } | null {
    if (!token.startsWith('sk_sessions_')) return null;
    const payload = token.slice('sk_sessions_'.length);
    const separator = payload.indexOf('.');
    if (separator <= 0 || separator === payload.length - 1) return null;
    const id = payload.slice(0, separator);
    const secret = payload.slice(separator + 1);
    if (!/^[0-9a-f-]{36}$/i.test(id) || secret.length < 32) return null;
    return { id, secret };
  }

  private safeKey<T extends {
    tokenHash: string;
    scopes: Prisma.JsonValue;
  }>(key: T) {
    const { tokenHash: _tokenHash, ...safe } = key;
    return { ...safe, scopes: this.scopes(key.scopes) };
  }

  private scopes(value: Prisma.JsonValue): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }

  private normalizeScopes(values: string[]): string[] {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
  }

  private assertAdmin(principal: Principal): void {
    if (!hasAnyRole(principal, ADMIN_ROLES)) {
      throw new ForbiddenException('Workspace owner or admin access is required');
    }
  }
}
