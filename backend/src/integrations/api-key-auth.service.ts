import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ApiKeyStatus, UserStatus } from '@prisma/client';
import type { Principal } from '../common/auth/principal';
import { WorkerPrismaService } from '../database/worker-prisma.service';
import { SecurityService } from '../auth/security.service';
import { isApiKeyScope } from './api-key-scopes';

const API_KEY_PATTERN = /^sess_([a-f0-9]{12})_([A-Za-z0-9_-]{43})$/;

@Injectable()
export class ApiKeyAuthService {
  constructor(
    private readonly prisma: WorkerPrismaService,
    private readonly security: SecurityService,
  ) {}

  async resolvePrincipal(rawKey: string): Promise<Principal> {
    const match = API_KEY_PATTERN.exec(rawKey);
    if (!match) throw this.invalid();

    const prefix = match[1]!;
    const candidates = await this.prisma.apiKey.findMany({
      where: {
        prefix,
        status: ApiKeyStatus.ACTIVE,
      },
      include: {
        createdBy: true,
      },
      take: 20,
    });

    const apiKey = candidates.find((candidate) =>
      this.security.verifyTokenDigest(rawKey, candidate.secretHash),
    );
    if (!apiKey) throw this.invalid();
    if (apiKey.expiresAt && apiKey.expiresAt <= new Date()) throw this.invalid();
    if (apiKey.createdBy.status !== UserStatus.ACTIVE) throw this.invalid();

    const membership = await this.prisma.workspaceMembership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: apiKey.workspaceId,
          userId: apiKey.createdById,
        },
      },
    });
    if (
      !membership ||
      membership.organizationId !== apiKey.organizationId
    ) {
      throw this.invalid();
    }

    const scopes = Array.isArray(apiKey.scopes)
      ? apiKey.scopes.filter(
          (value): value is string =>
            typeof value === 'string' && isApiKeyScope(value),
        )
      : [];

    const staleUsage =
      !apiKey.lastUsedAt ||
      apiKey.lastUsedAt.getTime() < Date.now() - 5 * 60 * 1000;
    if (staleUsage) {
      await this.prisma.apiKey.updateMany({
        where: {
          id: apiKey.id,
          status: ApiKeyStatus.ACTIVE,
        },
        data: { lastUsedAt: new Date() },
      });
    }

    return {
      userId: apiKey.createdById,
      organizationId: apiKey.organizationId,
      workspaceId: apiKey.workspaceId,
      email: apiKey.createdBy.email,
      displayName: apiKey.createdBy.displayName,
      roles: [membership.role],
      authType: 'api_key',
      apiKeyId: apiKey.id,
      apiKeyScopes: scopes,
    };
  }

  private invalid(): UnauthorizedException {
    return new UnauthorizedException('The API key is invalid or expired');
  }
}
