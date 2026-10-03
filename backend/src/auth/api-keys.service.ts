import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import type { Principal } from '../common/auth/principal';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { WorkerPrismaService } from '../database/worker-prisma.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

const API_KEY_PREFIX = 'sk_sessions_';

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly workerPrisma: WorkerPrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(principal: Principal, input: CreateApiKeyDto) {
    this.assertHumanAdmin(principal);

    const id = randomUUID();
    const secret = randomBytes(32).toString('base64url');
    const token = `${API_KEY_PREFIX}${id}.${secret}`;
    const tokenHash = this.hash(token);
    const scopes = [...new Set(input.scopes)].sort();
    const expiresAt = input.expiresInDays
      ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const created = await this.database.run(principal, async (transaction) => {
      const key = await transaction.apiKey.create({
        data: {
          id,
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          createdById: principal.userId,
          name: input.name.trim(),
          tokenHash,
          tokenPrefix: token.slice(0, 24),
          scopes: scopes as Prisma.InputJsonValue,
          expiresAt,
        },
      });
      await this.audit.record(transaction, principal, {
        action: 'api_key.created',
        resourceType: 'api_key',
        resourceId: key.id,
        metadata: { name: key.name, scopes, expiresAt },
      });
      return key;
    });

    return {
      ...this.publicKey(created),
      token,
    };
  }

  async list(principal: Principal) {
    this.assertHumanAdmin(principal);
    return this.database.run(principal, async (transaction) => {
      const keys = await transaction.apiKey.findMany({
        orderBy: { createdAt: 'desc' },
      });
      return keys.map((key) => this.publicKey(key));
    });
  }

  async revoke(principal: Principal, id: string) {
    this.assertHumanAdmin(principal);
    return this.database.run(principal, async (transaction) => {
      const existing = await transaction.apiKey.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('API key not found');
      if (!existing.revokedAt) {
        await transaction.apiKey.update({
          where: { id },
          data: { revokedAt: new Date() },
        });
        await this.audit.record(transaction, principal, {
          action: 'api_key.revoked',
          resourceType: 'api_key',
          resourceId: id,
          metadata: { name: existing.name },
        });
      }
      return { id, revoked: true };
    });
  }

  async authenticate(token: string): Promise<Principal> {
    const parsed = this.parse(token);
    if (!parsed) throw new UnauthorizedException('The API key is invalid');

    const key = await this.workerPrisma.apiKey.findUnique({
      where: { id: parsed.id },
    });
    if (
      !key ||
      key.revokedAt ||
      (key.expiresAt && key.expiresAt <= new Date()) ||
      !this.safeEqual(key.tokenHash, this.hash(token))
    ) {
      throw new UnauthorizedException('The API key is invalid or expired');
    }

    const [user, membership] = await Promise.all([
      this.workerPrisma.user.findUnique({ where: { id: key.createdById } }),
      this.workerPrisma.workspaceMembership.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: key.workspaceId,
            userId: key.createdById,
          },
        },
      }),
    ]);
    if (
      !user ||
      user.status !== UserStatus.ACTIVE ||
      !membership ||
      membership.organizationId !== key.organizationId
    ) {
      throw new UnauthorizedException('The API key owner no longer has workspace access');
    }

    await this.workerPrisma.apiKey.update({
      where: { id: key.id },
      data: { lastUsedAt: new Date() },
    });

    return {
      userId: user.id,
      organizationId: key.organizationId,
      workspaceId: key.workspaceId,
      email: user.email,
      displayName: user.displayName,
      roles: [membership.role],
      authType: 'api_key',
      apiKeyId: key.id,
      scopes: this.scopes(key.scopes),
    };
  }

  private parse(token: string): { id: string } | null {
    if (!token.startsWith(API_KEY_PREFIX)) return null;
    const raw = token.slice(API_KEY_PREFIX.length);
    const dot = raw.indexOf('.');
    if (dot <= 0) return null;
    const id = raw.slice(0, dot);
    return /^[0-9a-f-]{36}$/i.test(id) ? { id } : null;
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private safeEqual(expected: string, actual: string): boolean {
    const left = Buffer.from(expected, 'hex');
    const right = Buffer.from(actual, 'hex');
    return left.length === right.length && timingSafeEqual(left, right);
  }

  private scopes(value: Prisma.JsonValue): Array<'read' | 'write'> {
    if (!Array.isArray(value)) return [];
    return value.filter(
      (scope): scope is 'read' | 'write' => scope === 'read' || scope === 'write',
    );
  }

  private publicKey(key: {
    id: string;
    name: string;
    tokenPrefix: string;
    scopes: Prisma.JsonValue;
    lastUsedAt: Date | null;
    expiresAt: Date | null;
    revokedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: key.id,
      name: key.name,
      tokenPrefix: key.tokenPrefix,
      scopes: this.scopes(key.scopes),
      lastUsedAt: key.lastUsedAt,
      expiresAt: key.expiresAt,
      revokedAt: key.revokedAt,
      createdAt: key.createdAt,
      updatedAt: key.updatedAt,
    };
  }

  private assertHumanAdmin(principal: Principal): void {
    if (principal.authType === 'api_key') {
      throw new ForbiddenException('API keys cannot create or manage API keys');
    }
    if (!principal.roles.some((role) => role === 'OWNER' || role === 'ADMIN')) {
      throw new ForbiddenException('An owner or admin role is required');
    }
  }
}
