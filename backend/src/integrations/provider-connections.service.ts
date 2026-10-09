import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  ProviderConnectionKind,
  ProviderConnectionStatus,
} from '@prisma/client';
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
import type { CreateProviderConnectionDto } from './dto/create-provider-connection.dto';
import type { RotateProviderCredentialDto } from './dto/rotate-provider-credential.dto';
import type { UpdateProviderConnectionDto } from './dto/update-provider-connection.dto';
import { resolvePublicWebhookTarget } from './webhook-http.client';

export interface ResolvedProviderCredential {
  id: string;
  kind: ProviderConnectionKind;
  endpointUrl: string;
  secret: string;
  config: Prisma.JsonValue;
  credentialVersion: number;
}

@Injectable()
export class ProviderConnectionsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly worker: WorkerPrismaService,
    private readonly security: SecurityService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async list(principal: Principal) {
    this.assertAdmin(principal);
    return this.database.run(principal, async (transaction) => {
      const connections = await transaction.providerConnection.findMany({
        orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }],
      });
      return connections.map((connection) => this.publicProjection(connection));
    });
  }

  async create(principal: Principal, input: CreateProviderConnectionDto) {
    this.assertAdmin(principal);
    await this.validateEndpoint(input.endpointUrl);
    const config = this.validateConfig(input.config ?? {});

    return this.database.run(principal, async (transaction) => {
      const existing = await transaction.providerConnection.findUnique({
        where: {
          workspaceId_kind: {
            workspaceId: principal.workspaceId,
            kind: input.kind,
          },
        },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException(
          'A provider connection of this kind already exists in the workspace',
        );
      }

      const id = crypto.randomUUID();
      const credentialVersion = 1;
      const created = await transaction.providerConnection.create({
        data: {
          id,
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          createdById: principal.userId,
          kind: input.kind,
          name: input.name.trim(),
          endpointUrl: new URL(input.endpointUrl).toString(),
          secretCiphertext: this.security.encryptSensitiveValue(
            input.secret,
            this.purpose(id, credentialVersion),
          ),
          credentialVersion,
          config: config as Prisma.InputJsonValue,
        },
      });

      await this.audit.record(transaction, principal, {
        action: 'integration.provider.created',
        resourceType: 'provider_connection',
        resourceId: created.id,
        metadata: {
          kind: created.kind,
          name: created.name,
          endpointUrl: created.endpointUrl,
          credentialVersion: created.credentialVersion,
        },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'provider_connection',
        aggregateId: created.id,
        eventType: 'integration.provider.created',
        payload: {
          providerConnectionId: created.id,
          kind: created.kind,
          name: created.name,
        },
      });

      return this.publicProjection(created);
    });
  }

  async update(
    principal: Principal,
    connectionId: string,
    input: UpdateProviderConnectionDto,
  ) {
    this.assertAdmin(principal);
    if (input.endpointUrl) await this.validateEndpoint(input.endpointUrl);
    const config =
      input.config !== undefined ? this.validateConfig(input.config) : undefined;

    return this.database.run(principal, async (transaction) => {
      const existing = await transaction.providerConnection.findUnique({
        where: { id: connectionId },
      });
      if (!existing) throw new NotFoundException('Provider connection not found');

      const updated = await transaction.providerConnection.update({
        where: { id: existing.id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.endpointUrl !== undefined
            ? { endpointUrl: new URL(input.endpointUrl).toString() }
            : {}),
          ...(config !== undefined
            ? { config: config as Prisma.InputJsonValue }
            : {}),
          lastError: null,
        },
      });

      await this.audit.record(transaction, principal, {
        action: 'integration.provider.updated',
        resourceType: 'provider_connection',
        resourceId: updated.id,
        metadata: {
          kind: updated.kind,
          name: updated.name,
          endpointUrl: updated.endpointUrl,
        },
      });
      return this.publicProjection(updated);
    });
  }

  async rotateCredential(
    principal: Principal,
    connectionId: string,
    input: RotateProviderCredentialDto,
  ) {
    this.assertAdmin(principal);
    return this.database.run(principal, async (transaction) => {
      const existing = await transaction.providerConnection.findUnique({
        where: { id: connectionId },
      });
      if (!existing) throw new NotFoundException('Provider connection not found');

      const credentialVersion = existing.credentialVersion + 1;
      const updated = await transaction.providerConnection.update({
        where: { id: existing.id },
        data: {
          secretCiphertext: this.security.encryptSensitiveValue(
            input.secret,
            this.purpose(existing.id, credentialVersion),
          ),
          credentialVersion,
          status: ProviderConnectionStatus.ACTIVE,
          lastError: null,
        },
      });

      await this.audit.record(transaction, principal, {
        action: 'integration.provider.credential_rotated',
        resourceType: 'provider_connection',
        resourceId: updated.id,
        metadata: {
          kind: updated.kind,
          credentialVersion: updated.credentialVersion,
        },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'provider_connection',
        aggregateId: updated.id,
        eventType: 'integration.provider.credential_rotated',
        payload: {
          providerConnectionId: updated.id,
          kind: updated.kind,
          credentialVersion: updated.credentialVersion,
        },
      });
      return this.publicProjection(updated);
    });
  }

  async setEnabled(
    principal: Principal,
    connectionId: string,
    enabled: boolean,
  ) {
    this.assertAdmin(principal);
    return this.database.run(principal, async (transaction) => {
      const existing = await transaction.providerConnection.findUnique({
        where: { id: connectionId },
      });
      if (!existing) throw new NotFoundException('Provider connection not found');
      if (enabled) await this.validateEndpoint(existing.endpointUrl);

      const status = enabled
        ? ProviderConnectionStatus.ACTIVE
        : ProviderConnectionStatus.DISABLED;
      const updated = await transaction.providerConnection.update({
        where: { id: existing.id },
        data: {
          status,
          lastError: null,
        },
      });

      await this.audit.record(transaction, principal, {
        action: enabled
          ? 'integration.provider.enabled'
          : 'integration.provider.disabled',
        resourceType: 'provider_connection',
        resourceId: updated.id,
        metadata: { kind: updated.kind },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'provider_connection',
        aggregateId: updated.id,
        eventType: enabled
          ? 'integration.provider.enabled'
          : 'integration.provider.disabled',
        payload: {
          providerConnectionId: updated.id,
          kind: updated.kind,
        },
      });
      return this.publicProjection(updated);
    });
  }

  async resolveActiveCredential(
    organizationId: string,
    workspaceId: string,
    kind: ProviderConnectionKind,
  ): Promise<ResolvedProviderCredential | null> {
    const connection = await this.worker.providerConnection.findUnique({
      where: {
        workspaceId_kind: { workspaceId, kind },
      },
    });
    if (
      !connection ||
      connection.organizationId !== organizationId ||
      connection.status !== ProviderConnectionStatus.ACTIVE
    ) {
      return null;
    }

    const staleUsage =
      !connection.lastUsedAt ||
      connection.lastUsedAt.getTime() < Date.now() - 5 * 60 * 1000;
    if (staleUsage) {
      await this.worker.providerConnection.updateMany({
        where: {
          id: connection.id,
          status: ProviderConnectionStatus.ACTIVE,
        },
        data: { lastUsedAt: new Date() },
      });
    }

    return {
      id: connection.id,
      kind: connection.kind,
      endpointUrl: connection.endpointUrl,
      secret: this.security.decryptSensitiveValue(
        connection.secretCiphertext,
        this.purpose(connection.id, connection.credentialVersion),
      ),
      config: connection.config,
      credentialVersion: connection.credentialVersion,
    };
  }

  async recordExecution(
    connectionId: string,
    success: boolean,
    error?: string,
  ): Promise<void> {
    await this.worker.providerConnection.updateMany({
      where: { id: connectionId },
      data: success
        ? {
            status: ProviderConnectionStatus.ACTIVE,
            lastSuccessAt: new Date(),
            lastError: null,
          }
        : {
            status: ProviderConnectionStatus.ERROR,
            lastFailureAt: new Date(),
            lastError: (error ?? 'provider_execution_failed').slice(0, 1000),
          },
    });
  }

  private async validateEndpoint(value: string): Promise<void> {
    try {
      await resolvePublicWebhookTarget(value);
    } catch {
      throw new BadRequestException(
        'Provider endpoint must resolve to a public HTTPS address',
      );
    }
  }

  private validateConfig(value: Record<string, unknown>): Record<string, unknown> {
    const visit = (input: unknown, path: string): void => {
      if (Array.isArray(input)) {
        input.forEach((item, index) => visit(item, `${path}[${index}]`));
        return;
      }
      if (!input || typeof input !== 'object') return;
      for (const [key, child] of Object.entries(
        input as Record<string, unknown>,
      )) {
        if (/(secret|token|password|api.?key|credential)/i.test(key)) {
          throw new BadRequestException(
            `Sensitive provider config key is not allowed: ${path}${key}`,
          );
        }
        visit(child, `${path}${key}.`);
      }
    };
    visit(value, '');
    return value;
  }

  private publicProjection(connection: {
    id: string;
    kind: ProviderConnectionKind;
    name: string;
    endpointUrl: string;
    config: Prisma.JsonValue;
    status: ProviderConnectionStatus;
    credentialVersion: number;
    lastUsedAt: Date | null;
    lastSuccessAt: Date | null;
    lastFailureAt: Date | null;
    lastError: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: connection.id,
      kind: connection.kind,
      name: connection.name,
      endpointUrl: connection.endpointUrl,
      config: connection.config,
      status: connection.status,
      credentialVersion: connection.credentialVersion,
      lastUsedAt: connection.lastUsedAt,
      lastSuccessAt: connection.lastSuccessAt,
      lastFailureAt: connection.lastFailureAt,
      lastError: connection.lastError,
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
    };
  }

  private purpose(id: string, version: number): string {
    return `provider-connection:${id}:v${version}`;
  }

  private assertAdmin(principal: Principal): void {
    if (!hasAnyRole(principal, ADMIN_ROLES)) {
      throw new ForbiddenException('An owner or admin role is required');
    }
  }
}
