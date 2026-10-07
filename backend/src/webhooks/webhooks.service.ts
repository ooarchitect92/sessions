import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { SecurityService } from '../auth/security.service';
import {
  ADMIN_ROLES,
  hasAnyRole,
  type Principal,
} from '../common/auth/principal';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { OutboxService } from '../outbox/outbox.service';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { UpdateWebhookDto } from './dto/update-webhook.dto';

@Injectable()
export class WebhooksService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly security: SecurityService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async list(principal: Principal) {
    this.assertAdmin(principal);
    return this.database.run(principal, async (transaction) => {
      const subscriptions = await transaction.webhookSubscription.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { deliveries: true } },
          deliveries: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              status: true,
              eventType: true,
              attempts: true,
              deliveredAt: true,
              lastError: true,
              createdAt: true,
            },
          },
        },
      });
      return subscriptions.map(({ encryptedSecret: _secret, ...subscription }) => ({
        ...subscription,
        eventTypes: this.eventTypes(subscription.eventTypes),
      }));
    });
  }

  async create(principal: Principal, body: CreateWebhookDto) {
    this.assertAdmin(principal);
    const endpoint = this.validateUrl(body.url);
    const id = randomUUID();
    const secret = randomBytes(32).toString('base64url');
    const eventTypes = this.normalizeEventTypes(body.eventTypes);

    const subscription = await this.database.run(principal, async (transaction) => {
      const created = await transaction.webhookSubscription.create({
        data: {
          id,
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          createdByUserId: principal.userId,
          name: body.name.trim(),
          url: endpoint,
          encryptedSecret: this.security.encryptSensitiveValue(
            secret,
            `webhook-secret:${id}`,
          ),
          eventTypes,
        },
      });
      await this.audit.record(transaction, principal, {
        action: 'webhook.subscription_created',
        resourceType: 'webhook_subscription',
        resourceId: created.id,
        metadata: {
          name: created.name,
          url: created.url,
          eventTypes,
        },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'webhook_subscription',
        aggregateId: created.id,
        eventType: 'webhook.subscription.created',
        payload: {
          webhookSubscriptionId: created.id,
          name: created.name,
          eventTypes,
        },
      });
      return created;
    });

    const { encryptedSecret: _encryptedSecret, ...safe } = subscription;
    return {
      ...safe,
      eventTypes,
      secret,
      secretWarning: 'Store this signing secret now. It will not be shown again.',
    };
  }

  async update(
    principal: Principal,
    id: string,
    expectedVersion: number,
    body: UpdateWebhookDto,
  ) {
    this.assertAdmin(principal);
    if (Object.keys(body).length === 0) {
      throw new BadRequestException('At least one webhook field must be supplied');
    }
    const url = body.url !== undefined ? this.validateUrl(body.url) : undefined;
    const eventTypes =
      body.eventTypes !== undefined
        ? this.normalizeEventTypes(body.eventTypes)
        : undefined;

    return this.database.run(principal, async (transaction) => {
      const current = await transaction.webhookSubscription.findUnique({
        where: { id },
      });
      if (!current) throw new NotFoundException('Webhook subscription not found');
      if (current.version !== expectedVersion) {
        throw new ConflictException(
          `Webhook version mismatch. Current version is ${current.version}`,
        );
      }

      const updated = await transaction.webhookSubscription.update({
        where: { id },
        data: {
          version: { increment: 1 },
          ...(body.name !== undefined ? { name: body.name.trim() } : {}),
          ...(url !== undefined ? { url } : {}),
          ...(eventTypes !== undefined ? { eventTypes } : {}),
          ...(body.active !== undefined ? { active: body.active } : {}),
        },
      });
      await this.audit.record(transaction, principal, {
        action: 'webhook.subscription_updated',
        resourceType: 'webhook_subscription',
        resourceId: updated.id,
        metadata: {
          previousVersion: current.version,
          version: updated.version,
          active: updated.active,
        },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'webhook_subscription',
        aggregateId: updated.id,
        eventType: 'webhook.subscription.updated',
        payload: {
          webhookSubscriptionId: updated.id,
          version: updated.version,
          active: updated.active,
        },
      });
      const { encryptedSecret: _encryptedSecret, ...safe } = updated;
      return { ...safe, eventTypes: this.eventTypes(updated.eventTypes) };
    });
  }

  async remove(principal: Principal, id: string) {
    this.assertAdmin(principal);
    return this.database.run(principal, async (transaction) => {
      const current = await transaction.webhookSubscription.findUnique({
        where: { id },
      });
      if (!current) throw new NotFoundException('Webhook subscription not found');
      await transaction.webhookSubscription.delete({ where: { id } });
      await this.audit.record(transaction, principal, {
        action: 'webhook.subscription_deleted',
        resourceType: 'webhook_subscription',
        resourceId: id,
        metadata: { name: current.name, url: current.url },
      });
      return { id, deleted: true as const };
    });
  }

  async rotateSecret(principal: Principal, id: string) {
    this.assertAdmin(principal);
    const secret = randomBytes(32).toString('base64url');
    const updated = await this.database.run(principal, async (transaction) => {
      const current = await transaction.webhookSubscription.findUnique({
        where: { id },
      });
      if (!current) throw new NotFoundException('Webhook subscription not found');
      const next = await transaction.webhookSubscription.update({
        where: { id },
        data: {
          encryptedSecret: this.security.encryptSensitiveValue(
            secret,
            `webhook-secret:${id}`,
          ),
          version: { increment: 1 },
        },
      });
      await this.audit.record(transaction, principal, {
        action: 'webhook.secret_rotated',
        resourceType: 'webhook_subscription',
        resourceId: id,
        metadata: { version: next.version },
      });
      return next;
    });
    return {
      id: updated.id,
      version: updated.version,
      secret,
      secretWarning: 'Store this signing secret now. It will not be shown again.',
    };
  }

  async listDeliveries(principal: Principal, id: string) {
    this.assertAdmin(principal);
    return this.database.run(principal, async (transaction) => {
      const subscription = await transaction.webhookSubscription.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!subscription) throw new NotFoundException('Webhook subscription not found');
      return transaction.webhookDelivery.findMany({
        where: { subscriptionId: id },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
    });
  }

  async replay(principal: Principal, deliveryId: string) {
    this.assertAdmin(principal);
    return this.database.run(principal, async (transaction) => {
      const delivery = await transaction.webhookDelivery.findUnique({
        where: { id: deliveryId },
      });
      if (!delivery) throw new NotFoundException('Webhook delivery not found');

      const replayed = await transaction.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'PENDING',
          attempts: 0,
          lastStatusCode: null,
          lastResponseBody: null,
          lastError: null,
          nextAttemptAt: new Date(),
          deliveredAt: null,
        },
      });
      await this.audit.record(transaction, principal, {
        action: 'webhook.delivery_replayed',
        resourceType: 'webhook_delivery',
        resourceId: deliveryId,
        metadata: {
          subscriptionId: delivery.subscriptionId,
          eventType: delivery.eventType,
        },
      });
      return replayed;
    });
  }

  private assertAdmin(principal: Principal): void {
    if (!hasAnyRole(principal, ADMIN_ROLES)) {
      throw new ForbiddenException('Workspace owner or admin access is required');
    }
  }

  private normalizeEventTypes(values: string[]): string[] {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
  }

  private eventTypes(value: Prisma.JsonValue): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }

  private validateUrl(rawUrl: string): string {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new BadRequestException('Webhook URL is invalid');
    }
    if (url.username || url.password) {
      throw new BadRequestException('Webhook URL cannot contain credentials');
    }
    const localDevelopment =
      this.config.get<string>('NODE_ENV') !== 'production' &&
      ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(localDevelopment && url.protocol === 'http:')) {
      throw new BadRequestException(
        'Webhook URL must use HTTPS (HTTP localhost is allowed only outside production)',
      );
    }
    return url.toString();
  }
}
