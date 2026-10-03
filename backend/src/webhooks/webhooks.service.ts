import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  WebhookDeliveryStatus,
  type OutboxEvent,
  type WebhookSubscription,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { ADMIN_ROLES, hasAnyRole, type Principal } from '../common/auth/principal';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { WorkerPrismaService } from '../database/worker-prisma.service';
import { CreateWebhookSubscriptionDto } from './dto/create-webhook-subscription.dto';
import { UpdateWebhookSubscriptionDto } from './dto/update-webhook-subscription.dto';
import { WebhookCryptoService } from './webhook-crypto.service';
import { WebhookEgressPolicyService } from './webhook-egress-policy.service';

@Injectable()
export class WebhooksService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly workerPrisma: WorkerPrismaService,
    private readonly audit: AuditService,
    private readonly crypto: WebhookCryptoService,
    private readonly egressPolicy: WebhookEgressPolicyService,
  ) {}

  async create(principal: Principal, input: CreateWebhookSubscriptionDto) {
    this.assertAdmin(principal);
    const url = this.egressPolicy.validateConfiguration(input.url).toString();
    const eventTypes = this.normalizeEventTypes(input.eventTypes);
    const id = randomUUID();
    const secret = this.crypto.createSecret();
    const secretEncrypted = this.crypto.encryptSecret(id, secret);

    const subscription = await this.database.run(principal, async (transaction) => {
      const created = await transaction.webhookSubscription.create({
        data: {
          id,
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          createdById: principal.userId,
          url,
          description: input.description?.trim() || null,
          eventTypes: eventTypes as unknown as Prisma.InputJsonValue,
          secretEncrypted,
        },
      });
      await this.audit.record(transaction, principal, {
        action: 'webhook_subscription.created',
        resourceType: 'webhook_subscription',
        resourceId: created.id,
        metadata: { url: created.url, eventTypes },
      });
      return created;
    });

    return {
      ...this.publicSubscription(subscription),
      secret,
    };
  }

  async list(principal: Principal) {
    this.assertAdmin(principal);
    return this.database.run(principal, async (transaction) => {
      const subscriptions = await transaction.webhookSubscription.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { deliveries: true } },
        },
      });
      return subscriptions.map((subscription) => ({
        ...this.publicSubscription(subscription),
        deliveryCount: subscription._count.deliveries,
      }));
    });
  }

  async getById(principal: Principal, id: string) {
    this.assertAdmin(principal);
    return this.database.run(principal, async (transaction) => {
      const subscription = await transaction.webhookSubscription.findUnique({
        where: { id },
        include: {
          _count: { select: { deliveries: true } },
        },
      });
      if (!subscription) throw new NotFoundException('Webhook subscription not found');
      return {
        ...this.publicSubscription(subscription),
        deliveryCount: subscription._count.deliveries,
      };
    });
  }

  async update(
    principal: Principal,
    id: string,
    expectedVersion: number,
    input: UpdateWebhookSubscriptionDto,
  ) {
    this.assertAdmin(principal);
    if (Object.keys(input).length === 0) {
      throw new BadRequestException('At least one webhook field must be supplied');
    }
    const normalizedUrl =
      input.url !== undefined
        ? this.egressPolicy.validateConfiguration(input.url).toString()
        : undefined;
    const eventTypes =
      input.eventTypes !== undefined
        ? this.normalizeEventTypes(input.eventTypes)
        : undefined;

    return this.database.run(principal, async (transaction) => {
      const result = await transaction.webhookSubscription.updateMany({
        where: { id, version: expectedVersion },
        data: {
          version: { increment: 1 },
          ...(normalizedUrl !== undefined ? { url: normalizedUrl } : {}),
          ...(input.description !== undefined
            ? { description: input.description?.trim() || null }
            : {}),
          ...(eventTypes !== undefined
            ? { eventTypes: eventTypes as unknown as Prisma.InputJsonValue }
            : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
        },
      });

      if (result.count === 0) {
        const current = await transaction.webhookSubscription.findUnique({
          where: { id },
          select: { version: true },
        });
        if (!current) throw new NotFoundException('Webhook subscription not found');
        throw new ConflictException(
          'Version conflict. Current version is ' + current.version,
        );
      }

      const subscription = await transaction.webhookSubscription.findUniqueOrThrow({
        where: { id },
      });
      await this.audit.record(transaction, principal, {
        action: 'webhook_subscription.updated',
        resourceType: 'webhook_subscription',
        resourceId: id,
        metadata: {
          previousVersion: expectedVersion,
          version: subscription.version,
          active: subscription.active,
        },
      });
      return this.publicSubscription(subscription);
    });
  }

  async rotateSecret(principal: Principal, id: string) {
    this.assertAdmin(principal);
    const secret = this.crypto.createSecret();
    const secretEncrypted = this.crypto.encryptSecret(id, secret);
    const subscription = await this.database.run(principal, async (transaction) => {
      const existing = await transaction.webhookSubscription.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException('Webhook subscription not found');
      const updated = await transaction.webhookSubscription.update({
        where: { id },
        data: {
          secretEncrypted,
          failureCount: 0,
          version: { increment: 1 },
        },
      });
      await this.audit.record(transaction, principal, {
        action: 'webhook_subscription.secret_rotated',
        resourceType: 'webhook_subscription',
        resourceId: id,
        metadata: {},
      });
      return updated;
    });
    return {
      ...this.publicSubscription(subscription),
      secret,
    };
  }

  async remove(principal: Principal, id: string) {
    this.assertAdmin(principal);
    return this.database.run(principal, async (transaction) => {
      const existing = await transaction.webhookSubscription.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException('Webhook subscription not found');
      await transaction.webhookSubscription.delete({ where: { id } });
      await this.audit.record(transaction, principal, {
        action: 'webhook_subscription.deleted',
        resourceType: 'webhook_subscription',
        resourceId: id,
        metadata: {},
      });
      return { id, deleted: true };
    });
  }

  async listDeliveries(principal: Principal, subscriptionId: string) {
    this.assertAdmin(principal);
    return this.database.run(principal, async (transaction) => {
      const subscription = await transaction.webhookSubscription.findUnique({
        where: { id: subscriptionId },
        select: { id: true },
      });
      if (!subscription) throw new NotFoundException('Webhook subscription not found');
      return transaction.webhookDelivery.findMany({
        where: { subscriptionId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
    });
  }

  async replayDelivery(
    principal: Principal,
    subscriptionId: string,
    deliveryId: string,
  ) {
    this.assertAdmin(principal);
    return this.database.run(principal, async (transaction) => {
      const delivery = await transaction.webhookDelivery.findFirst({
        where: { id: deliveryId, subscriptionId },
        include: { subscription: true },
      });
      if (!delivery) throw new NotFoundException('Webhook delivery not found');
      if (!delivery.subscription.active) {
        throw new ConflictException('Webhook subscription is inactive');
      }
      const updated = await transaction.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: WebhookDeliveryStatus.PENDING,
          attemptCount: 0,
          nextAttemptAt: new Date(),
          responseStatus: null,
          lastError: null,
          deliveredAt: null,
        },
      });
      await this.audit.record(transaction, principal, {
        action: 'webhook_delivery.replayed',
        resourceType: 'webhook_delivery',
        resourceId: delivery.id,
        metadata: { subscriptionId },
      });
      return updated;
    });
  }

  async fanout(
    event: Pick<
      OutboxEvent,
      'id' | 'organizationId' | 'workspaceId' | 'eventType' | 'payload'
    >,
  ): Promise<void> {
    const subscriptions = await this.workerPrisma.webhookSubscription.findMany({
      where: {
        organizationId: event.organizationId,
        workspaceId: event.workspaceId,
        active: true,
      },
      select: {
        id: true,
        eventTypes: true,
      },
    });

    const matches = subscriptions.filter((subscription) =>
      this.subscriptionMatches(subscription.eventTypes, event.eventType),
    );
    if (matches.length === 0) return;

    await this.workerPrisma.webhookDelivery.createMany({
      data: matches.map((subscription) => ({
        organizationId: event.organizationId,
        workspaceId: event.workspaceId,
        subscriptionId: subscription.id,
        outboxEventId: event.id,
        eventType: event.eventType,
        payload: event.payload as Prisma.InputJsonValue,
      })),
      skipDuplicates: true,
    });
  }

  private subscriptionMatches(value: Prisma.JsonValue, eventType: string): boolean {
    if (!Array.isArray(value)) return false;
    return value.some(
      (candidate) =>
        candidate === '*' ||
        (typeof candidate === 'string' && candidate === eventType),
    );
  }

  private normalizeEventTypes(eventTypes: string[]): string[] {
    const normalized = eventTypes.map((eventType) => eventType.trim()).filter(Boolean);
    if (normalized.length === 0) {
      throw new BadRequestException('At least one webhook event type is required');
    }
    return [...new Set(normalized)].sort();
  }

  private publicSubscription(
    subscription: Pick<
      WebhookSubscription,
      | 'id'
      | 'url'
      | 'description'
      | 'eventTypes'
      | 'active'
      | 'failureCount'
      | 'lastSuccessAt'
      | 'lastFailureAt'
      | 'version'
      | 'createdAt'
      | 'updatedAt'
    >,
  ) {
    return {
      id: subscription.id,
      url: subscription.url,
      description: subscription.description,
      eventTypes: subscription.eventTypes,
      active: subscription.active,
      failureCount: subscription.failureCount,
      lastSuccessAt: subscription.lastSuccessAt,
      lastFailureAt: subscription.lastFailureAt,
      version: subscription.version,
      createdAt: subscription.createdAt,
      updatedAt: subscription.updatedAt,
    };
  }

  private assertAdmin(principal: Principal): void {
    if (!hasAnyRole(principal, ADMIN_ROLES)) {
      throw new ForbiddenException('An owner or admin role is required');
    }
  }
}
