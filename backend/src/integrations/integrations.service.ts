import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ApiKeyStatus, Prisma } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { SecurityService } from '../auth/security.service';
import { ADMIN_ROLES, hasAnyRole, type Principal } from '../common/auth/principal';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { OutboxService } from '../outbox/outbox.service';
import type { CreateApiKeyDto } from './dto/create-api-key.dto';
import type { CreateWebhookSubscriptionDto } from './dto/create-webhook-subscription.dto';

const MAX_API_KEY_SCOPES = 50;
const MAX_WEBHOOK_EVENT_TYPES = 100;

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly security: SecurityService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async listApiKeys(principal: Principal) {
    this.assertAdmin(principal);
    return this.database.run(principal, (transaction) =>
      transaction.apiKey.findMany({
        select: {
          id: true,
          name: true,
          prefix: true,
          scopes: true,
          status: true,
          lastUsedAt: true,
          expiresAt: true,
          revokedAt: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async createApiKey(principal: Principal, input: CreateApiKeyDto) {
    this.assertAdmin(principal);
    const scopes = this.normalizeValues(input.scopes ?? [], MAX_API_KEY_SCOPES, 'scope');
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('API key expiry must be in the future');
    }

    const prefix = randomBytes(6).toString('hex');
    const secret = randomBytes(32).toString('base64url');
    const rawKey = `sess_${prefix}_${secret}`;
    const secretHash = this.security.digestToken(rawKey);

    const apiKey = await this.database.run(principal, async (transaction) => {
      const created = await transaction.apiKey.create({
        data: {
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          createdById: principal.userId,
          name: input.name.trim(),
          prefix,
          secretHash,
          scopes: scopes as Prisma.InputJsonValue,
          expiresAt,
        },
      });
      await this.audit.record(transaction, principal, {
        action: 'integration.api_key.created',
        resourceType: 'api_key',
        resourceId: created.id,
        metadata: { name: created.name, prefix: created.prefix, scopes },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'api_key',
        aggregateId: created.id,
        eventType: 'integration.api_key.created',
        payload: { apiKeyId: created.id, name: created.name, prefix: created.prefix, scopes },
      });
      return created;
    });

    return {
      id: apiKey.id,
      name: apiKey.name,
      prefix: apiKey.prefix,
      scopes: apiKey.scopes,
      expiresAt: apiKey.expiresAt,
      createdAt: apiKey.createdAt,
      secret: rawKey,
    };
  }

  async revokeApiKey(principal: Principal, apiKeyId: string) {
    this.assertAdmin(principal);
    return this.database.run(principal, async (transaction) => {
      const existing = await transaction.apiKey.findUnique({ where: { id: apiKeyId } });
      if (!existing) throw new NotFoundException('API key not found');
      if (existing.status === ApiKeyStatus.REVOKED) return this.apiKeyProjection(existing);

      const updated = await transaction.apiKey.update({
        where: { id: apiKeyId },
        data: { status: ApiKeyStatus.REVOKED, revokedAt: new Date() },
      });
      await this.audit.record(transaction, principal, {
        action: 'integration.api_key.revoked',
        resourceType: 'api_key',
        resourceId: updated.id,
        metadata: { prefix: updated.prefix },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'api_key',
        aggregateId: updated.id,
        eventType: 'integration.api_key.revoked',
        payload: { apiKeyId: updated.id, prefix: updated.prefix },
      });
      return this.apiKeyProjection(updated);
    });
  }

  async listWebhookSubscriptions(principal: Principal) {
    this.assertAdmin(principal);
    return this.database.run(principal, (transaction) =>
      transaction.webhookSubscription.findMany({
        select: {
          id: true,
          name: true,
          endpointUrl: true,
          eventTypes: true,
          enabled: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async createWebhookSubscription(principal: Principal, input: CreateWebhookSubscriptionDto) {
    this.assertAdmin(principal);
    const endpoint = new URL(input.endpointUrl);
    if (endpoint.protocol !== 'https:') {
      throw new BadRequestException('Webhook endpoints must use HTTPS');
    }
    if (endpoint.username || endpoint.password) {
      throw new BadRequestException('Webhook endpoint credentials in URLs are not allowed');
    }
    const eventTypes = this.normalizeValues(
      input.eventTypes,
      MAX_WEBHOOK_EVENT_TYPES,
      'event type',
    );
    if (eventTypes.length === 0) {
      throw new BadRequestException('At least one webhook event type is required');
    }

    const id = randomUUID();
    const signingSecret = randomBytes(32).toString('base64url');
    const secretCiphertext = this.security.encryptSensitiveValue(
      signingSecret,
      `webhook-signing:${id}`,
    );

    const subscription = await this.database.run(principal, async (transaction) => {
      const created = await transaction.webhookSubscription.create({
        data: {
          id,
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          createdById: principal.userId,
          name: input.name.trim(),
          endpointUrl: endpoint.toString(),
          eventTypes: eventTypes as Prisma.InputJsonValue,
          secretCiphertext,
          enabled: input.enabled ?? true,
        },
      });
      await this.audit.record(transaction, principal, {
        action: 'integration.webhook.created',
        resourceType: 'webhook_subscription',
        resourceId: created.id,
        metadata: {
          name: created.name,
          endpointUrl: created.endpointUrl,
          eventTypes,
          enabled: created.enabled,
        },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'webhook_subscription',
        aggregateId: created.id,
        eventType: 'integration.webhook.created',
        payload: {
          subscriptionId: created.id,
          endpointUrl: created.endpointUrl,
          eventTypes,
          enabled: created.enabled,
        },
      });
      return created;
    });

    return {
      id: subscription.id,
      name: subscription.name,
      endpointUrl: subscription.endpointUrl,
      eventTypes: subscription.eventTypes,
      enabled: subscription.enabled,
      createdAt: subscription.createdAt,
      signingSecret,
    };
  }

  async deleteWebhookSubscription(principal: Principal, subscriptionId: string) {
    this.assertAdmin(principal);
    return this.database.run(principal, async (transaction) => {
      const existing = await transaction.webhookSubscription.findUnique({
        where: { id: subscriptionId },
      });
      if (!existing) throw new NotFoundException('Webhook subscription not found');

      await transaction.webhookSubscription.delete({ where: { id: subscriptionId } });
      await this.audit.record(transaction, principal, {
        action: 'integration.webhook.deleted',
        resourceType: 'webhook_subscription',
        resourceId: existing.id,
        metadata: { endpointUrl: existing.endpointUrl },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'webhook_subscription',
        aggregateId: existing.id,
        eventType: 'integration.webhook.deleted',
        payload: { subscriptionId: existing.id, endpointUrl: existing.endpointUrl },
      });
      return { id: existing.id, deleted: true };
    });
  }

  private apiKeyProjection(apiKey: {
    id: string;
    name: string;
    prefix: string;
    scopes: Prisma.JsonValue;
    status: ApiKeyStatus;
    lastUsedAt: Date | null;
    expiresAt: Date | null;
    revokedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: apiKey.id,
      name: apiKey.name,
      prefix: apiKey.prefix,
      scopes: apiKey.scopes,
      status: apiKey.status,
      lastUsedAt: apiKey.lastUsedAt,
      expiresAt: apiKey.expiresAt,
      revokedAt: apiKey.revokedAt,
      createdAt: apiKey.createdAt,
      updatedAt: apiKey.updatedAt,
    };
  }

  private normalizeValues(values: string[], max: number, label: string): string[] {
    if (values.length > max) throw new BadRequestException(`Too many ${label}s`);
    const normalized = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
    if (normalized.some((value) => value.length > 160)) {
      throw new BadRequestException(`${label} values must be 160 characters or fewer`);
    }
    return normalized;
  }

  private assertAdmin(principal: Principal): void {
    if (!hasAnyRole(principal, ADMIN_ROLES)) {
      throw new ForbiddenException('An owner or admin role is required');
    }
  }
}
