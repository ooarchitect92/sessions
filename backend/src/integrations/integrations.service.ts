import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { WorkspaceRole } from '@prisma/client';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { AuditService } from '../audit/audit.service';
import { ADMIN_ROLES, hasAnyRole, type Principal } from '../common/auth/principal';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { WorkerPrismaService } from '../database/worker-prisma.service';
import { RedisService } from '../infrastructure/redis.service';
import { CreateApiKeyDto, CreateWebhookSubscriptionDto, ReconcileWebhookDto } from './integrations.dto';

type ApiKeyRow = {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  last_used_at: Date | null;
  expires_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
};

type WebhookRow = {
  id: string;
  name: string;
  endpoint_url: string;
  event_types: string[];
  active: boolean;
  last_success_at: Date | null;
  last_failure_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type ApiKeyAuthRow = {
  id: string;
  organization_id: string;
  workspace_id: string;
  created_by_id: string;
  scopes: string[];
  email: string;
  display_name: string;
  role: WorkspaceRole;
};

type DeliveryRow = {
  id: string;
  subscription_id: string;
  event_type: string;
  status: string;
  attempts: number;
  response_status: number | null;
  last_error: string | null;
  delivered_at: Date | null;
  dead_lettered_at: Date | null;
  created_at: Date;
};

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly workerPrisma: WorkerPrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  async authenticateApiKey(secret: string): Promise<Principal> {
    if (!secret.startsWith('sk_sessions_') || secret.length < 32 || secret.length > 200) {
      throw new UnauthorizedException('The API key is invalid');
    }

    const hash = createHash('sha256').update(secret).digest('hex');
    const rows = await this.workerPrisma.$queryRaw<ApiKeyAuthRow[]>`
      SELECT ak.id,
             ak.organization_id,
             ak.workspace_id,
             ak.created_by_id,
             ak.scopes,
             u.email,
             u.display_name,
             wm.role
      FROM api_keys ak
      JOIN users u ON u.id = ak.created_by_id
      JOIN workspace_memberships wm
        ON wm.workspace_id = ak.workspace_id
       AND wm.user_id = ak.created_by_id
      WHERE ak.key_hash = ${hash}
        AND ak.revoked_at IS NULL
        AND (ak.expires_at IS NULL OR ak.expires_at > NOW())
        AND u.status = 'ACTIVE'
      LIMIT 1
    `;

    const row = rows[0];
    if (!row) throw new UnauthorizedException('The API key is invalid or expired');

    const rateLimit = this.config.get<number>('API_KEY_RATE_LIMIT_PER_MINUTE', 120);
    const minute = Math.floor(Date.now() / 60_000);
    const rateKey = 'sessions:api-key-rate:' + row.id + ':' + minute;
    const count = await this.redis.incr(rateKey);
    if (count === 1) await this.redis.expire(rateKey, 70);
    if (count > rateLimit) {
      throw new HttpException('API key rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }

    await this.workerPrisma.$executeRaw`
      UPDATE api_keys SET last_used_at = NOW() WHERE id = ${row.id}::uuid
    `;

    return {
      userId: row.created_by_id,
      organizationId: row.organization_id,
      workspaceId: row.workspace_id,
      email: row.email,
      displayName: row.display_name,
      roles: [row.role],
      apiKeyId: row.id,
      apiScopes: row.scopes,
    };
  }
  async listApiKeys(principal: Principal) {
    this.assertAdmin(principal);
    return this.database.run(principal, (tx) =>
      tx.$queryRaw<ApiKeyRow[]>`
        SELECT id, name, key_prefix, scopes, last_used_at, expires_at, revoked_at, created_at
        FROM api_keys
        ORDER BY created_at DESC
      `,
    );
  }

  async createApiKey(principal: Principal, input: CreateApiKeyDto) {
    this.assertAdmin(principal);
    const secret = 'sk_sessions_' + randomBytes(32).toString('base64url');
    const hash = createHash('sha256').update(secret).digest('hex');
    const prefix = secret.slice(0, 20);
    const expiresAt = input.expiresInDays
      ? new Date(Date.now() + input.expiresInDays * 86_400_000)
      : null;

    return this.database.run(principal, async (tx) => {
      const rows = await tx.$queryRaw<ApiKeyRow[]>`
        INSERT INTO api_keys (
          organization_id, workspace_id, created_by_id, name, key_prefix, key_hash, scopes, expires_at
        ) VALUES (
          ${principal.organizationId}::uuid,
          ${principal.workspaceId}::uuid,
          ${principal.userId}::uuid,
          ${input.name.trim()},
          ${prefix},
          ${hash},
          ${input.scopes}::text[],
          ${expiresAt}
        )
        RETURNING id, name, key_prefix, scopes, last_used_at, expires_at, revoked_at, created_at
      `;
      const created = rows[0];
      if (!created) throw new Error('API key creation did not return a row');
      await this.audit.record(tx, principal, {
        action: 'api_key.created',
        resourceType: 'api_key',
        resourceId: created.id,
        metadata: { name: created.name, scopes: created.scopes },
      });
      return { ...created, secret };
    });
  }

  async revokeApiKey(principal: Principal, id: string) {
    this.assertAdmin(principal);
    return this.database.run(principal, async (tx) => {
      const rows = await tx.$queryRaw<ApiKeyRow[]>`
        UPDATE api_keys
        SET revoked_at = COALESCE(revoked_at, NOW())
        WHERE id = ${id}::uuid
        RETURNING id, name, key_prefix, scopes, last_used_at, expires_at, revoked_at, created_at
      `;
      const key = rows[0];
      if (!key) throw new NotFoundException('API key not found');
      await this.audit.record(tx, principal, {
        action: 'api_key.revoked',
        resourceType: 'api_key',
        resourceId: id,
      });
      return key;
    });
  }

  async listWebhooks(principal: Principal) {
    this.assertAdmin(principal);
    return this.database.run(principal, (tx) =>
      tx.$queryRaw<WebhookRow[]>`
        SELECT id, name, endpoint_url, event_types, active, last_success_at, last_failure_at, created_at, updated_at
        FROM webhook_subscriptions
        ORDER BY created_at DESC
      `,
    );
  }

  async createWebhook(principal: Principal, input: CreateWebhookSubscriptionDto) {
    this.assertAdmin(principal);
    await this.assertSafeEndpoint(input.endpointUrl);
    const signingSecret = 'whsec_' + randomBytes(32).toString('base64url');
    const encrypted = this.encrypt(signingSecret);
    const eventTypes = [...new Set(input.eventTypes.map((value) => value.trim()).filter(Boolean))];
    if (!eventTypes.length) throw new BadRequestException('At least one event type is required');

    return this.database.run(principal, async (tx) => {
      const rows = await tx.$queryRaw<WebhookRow[]>`
        INSERT INTO webhook_subscriptions (
          organization_id, workspace_id, created_by_id, name, endpoint_url, event_types, secret_ciphertext
        ) VALUES (
          ${principal.organizationId}::uuid,
          ${principal.workspaceId}::uuid,
          ${principal.userId}::uuid,
          ${input.name.trim()},
          ${input.endpointUrl},
          ${eventTypes}::text[],
          ${encrypted}
        )
        RETURNING id, name, endpoint_url, event_types, active, last_success_at, last_failure_at, created_at, updated_at
      `;
      const created = rows[0];
      if (!created) throw new Error('Webhook creation did not return a row');
      await this.audit.record(tx, principal, {
        action: 'webhook.created',
        resourceType: 'webhook_subscription',
        resourceId: created.id,
        metadata: { endpointUrl: created.endpoint_url, eventTypes: created.event_types },
      });
      return { ...created, signingSecret };
    });
  }

  async deleteWebhook(principal: Principal, id: string) {
    this.assertAdmin(principal);
    return this.database.run(principal, async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        DELETE FROM webhook_subscriptions
        WHERE id = ${id}::uuid
        RETURNING id
      `;
      if (!rows[0]) throw new NotFoundException('Webhook subscription not found');
      await this.audit.record(tx, principal, {
        action: 'webhook.deleted',
        resourceType: 'webhook_subscription',
        resourceId: id,
      });
      return { id, deleted: true };
    });
  }

  async reconcileWebhook(
    principal: Principal,
    subscriptionId: string,
    input: ReconcileWebhookDto,
  ) {
    this.assertAdmin(principal);
    const hours = input.hours ?? 24;
    return this.database.run(principal, async (tx) => {
      const exists = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM webhook_subscriptions
        WHERE id = ${subscriptionId}::uuid
        LIMIT 1
      `;
      if (!exists[0]) throw new NotFoundException('Webhook subscription not found');

      const inserted = await tx.$executeRaw`
        INSERT INTO webhook_deliveries (
          organization_id, workspace_id, subscription_id, outbox_event_id, event_type, payload
        )
        SELECT oe.organization_id, oe.workspace_id, ws.id, oe.id, oe.event_type, oe.payload
        FROM outbox_events oe
        JOIN webhook_subscriptions ws ON ws.id = ${subscriptionId}::uuid
          AND ws.organization_id = oe.organization_id
          AND ws.workspace_id = oe.workspace_id
          AND oe.event_type = ANY(ws.event_types)
        WHERE oe.published_at IS NOT NULL
          AND oe.created_at >= NOW() - (${hours}::text || ' hours')::interval
        ON CONFLICT (subscription_id, outbox_event_id) DO NOTHING
      `;

      await this.audit.record(tx, principal, {
        action: 'webhook.reconciled',
        resourceType: 'webhook_subscription',
        resourceId: subscriptionId,
        metadata: { hours, inserted },
      });
      return { subscriptionId, hours, inserted };
    });
  }

  async replayDelivery(principal: Principal, deliveryId: string) {
    this.assertAdmin(principal);
    return this.database.run(principal, async (tx) => {
      const rows = await tx.$queryRaw<{ id: string; subscription_id: string }[]>`
        UPDATE webhook_deliveries
        SET status = 'PENDING',
            attempts = 0,
            available_at = NOW(),
            locked_at = NULL,
            locked_by = NULL,
            response_status = NULL,
            last_error = NULL,
            delivered_at = NULL,
            dead_lettered_at = NULL,
            updated_at = NOW()
        WHERE id = ${deliveryId}::uuid
        RETURNING id, subscription_id
      `;
      const delivery = rows[0];
      if (!delivery) throw new NotFoundException('Webhook delivery not found');
      await this.audit.record(tx, principal, {
        action: 'webhook.delivery.replayed',
        resourceType: 'webhook_delivery',
        resourceId: deliveryId,
        metadata: { subscriptionId: delivery.subscription_id },
      });
      return { id: deliveryId, status: 'PENDING', replayed: true };
    });
  }
  async listDeliveries(principal: Principal, subscriptionId: string) {
    this.assertAdmin(principal);
    return this.database.run(principal, (tx) =>
      tx.$queryRaw<DeliveryRow[]>`
        SELECT id, subscription_id, event_type, status, attempts, response_status,
               last_error, delivered_at, dead_lettered_at, created_at
        FROM webhook_deliveries
        WHERE subscription_id = ${subscriptionId}::uuid
        ORDER BY created_at DESC
        LIMIT 100
      `,
    );
  }

  async retryDelivery(principal: Principal, deliveryId: string) {
    this.assertAdmin(principal);
    return this.database.run(principal, async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        UPDATE webhook_deliveries
        SET status = 'PENDING',
            available_at = NOW(),
            locked_at = NULL,
            locked_by = NULL,
            dead_lettered_at = NULL,
            last_error = NULL,
            updated_at = NOW()
        WHERE id = ${deliveryId}::uuid
        RETURNING id
      `;
      if (!rows[0]) throw new NotFoundException('Webhook delivery not found');
      await this.audit.record(tx, principal, {
        action: 'webhook.delivery.retried',
        resourceType: 'webhook_delivery',
        resourceId: deliveryId,
      });
      return { id: deliveryId, status: 'PENDING' };
    });
  }

  decryptSigningSecret(ciphertext: string): string {
    return this.decrypt(ciphertext);
  }

  async assertSafeEndpoint(raw: string): Promise<void> {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new BadRequestException('Webhook URL is invalid');
    }
    if (url.protocol !== 'https:') {
      throw new BadRequestException('Webhook endpoint must use HTTPS');
    }
    if (url.username || url.password) {
      throw new BadRequestException('Webhook endpoint must not contain credentials');
    }

    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
      throw new BadRequestException('Webhook endpoint must be publicly routable');
    }

    if (isIP(host)) {
      this.assertPublicIp(host);
      return;
    }

    let addresses: { address: string }[];
    try {
      addresses = await lookup(host, { all: true, verbatim: true });
    } catch {
      throw new BadRequestException('Webhook hostname could not be resolved');
    }
    if (!addresses.length) throw new BadRequestException('Webhook hostname could not be resolved');
    for (const result of addresses) this.assertPublicIp(result.address);
  }

  private assertPublicIp(address: string): void {
    const version = isIP(address);
    if (version === 4) {
      const parts = address.split('.').map(Number);
      const first = parts[0] ?? -1;
      const second = parts[1] ?? -1;
      const blocked =
        first === 10 ||
        first === 127 ||
        first === 0 ||
        (first === 100 && second >= 64 && second <= 127) ||
        (first === 169 && second === 254) ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168) ||
        first >= 224;
      if (blocked) throw new BadRequestException('Webhook endpoint must be publicly routable');
    }
    if (version === 6) {
      const normalized = address.toLowerCase();
      if (
        normalized === '::1' ||
        normalized === '::' ||
        normalized.startsWith('fc') ||
        normalized.startsWith('fd') ||
        normalized.startsWith('fe8') ||
        normalized.startsWith('fe9') ||
        normalized.startsWith('fea') ||
        normalized.startsWith('feb')
      ) {
        throw new BadRequestException('Webhook endpoint must be publicly routable');
      }
    }
  }

  private encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), encrypted]
      .map((part) => part.toString('base64url'))
      .join('.');
  }

  private decrypt(value: string): string {
    const [ivRaw, tagRaw, encryptedRaw] = value.split('.');
    if (!ivRaw || !tagRaw || !encryptedRaw) throw new Error('Invalid encrypted webhook secret');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey(),
      Buffer.from(ivRaw, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  private encryptionKey(): Buffer {
    const raw = this.config.getOrThrow<string>('AUTH_ENCRYPTION_KEY');
    if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
      throw new Error('AUTH_ENCRYPTION_KEY must be 64 hexadecimal characters');
    }
    return Buffer.from(raw, 'hex');
  }

  private assertAdmin(principal: Principal): void {
    if (!hasAnyRole(principal, ADMIN_ROLES)) {
      throw new ForbiddenException('Owner or admin role is required');
    }
  }
}