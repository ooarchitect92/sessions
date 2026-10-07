import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { WebhookDeliveryStatus, type Prisma } from '@prisma/client';
import { SecurityService } from '../auth/security.service';
import { WorkerPrismaService } from '../database/worker-prisma.service';
import {
  assertSafeWebhookTarget,
  signWebhookPayload,
} from './webhook-security';

@Injectable()
export class WebhookWorker {
  private readonly logger = new Logger(WebhookWorker.name);
  private running = false;

  constructor(
    private readonly prisma: WorkerPrismaService,
    private readonly security: SecurityService,
    private readonly config: ConfigService,
  ) {}

  @Interval(3000)
  async runCycle(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.seedDeliveries();
      const deliveries = await this.prisma.webhookDelivery.findMany({
        where: {
          status: {
            in: [
              WebhookDeliveryStatus.PENDING,
              WebhookDeliveryStatus.FAILED,
            ],
          },
          nextAttemptAt: { lte: new Date() },
          attempts: { lt: this.maxAttempts() },
          subscription: { active: true },
        },
        orderBy: { createdAt: 'asc' },
        take: this.config.get<number>('WEBHOOK_WORKER_BATCH_SIZE', 10),
      });
      for (const delivery of deliveries) {
        await this.deliver(delivery.id);
      }
    } catch (error: unknown) {
      this.logger.error(
        'Webhook worker cycle failed',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
  }

  private async seedDeliveries(): Promise<void> {
    const subscriptions = await this.prisma.webhookSubscription.findMany({
      where: { active: true },
      select: {
        id: true,
        organizationId: true,
        workspaceId: true,
        eventTypes: true,
        createdAt: true,
      },
      take: 250,
    });

    for (const subscription of subscriptions) {
      const eventTypes = this.eventTypes(subscription.eventTypes);
      if (!eventTypes.length) continue;
      const events = await this.prisma.outboxEvent.findMany({
        where: {
          organizationId: subscription.organizationId,
          workspaceId: subscription.workspaceId,
          eventType: { in: eventTypes },
          publishedAt: { not: null },
          deadLetteredAt: null,
          createdAt: { gte: subscription.createdAt },
        },
        select: { id: true, eventType: true },
        orderBy: { createdAt: 'asc' },
        take: 200,
      });
      if (!events.length) continue;
      await this.prisma.webhookDelivery.createMany({
        data: events.map((event) => ({
          organizationId: subscription.organizationId,
          workspaceId: subscription.workspaceId,
          subscriptionId: subscription.id,
          outboxEventId: event.id,
          eventType: event.eventType,
        })),
        skipDuplicates: true,
      });
    }
  }

  private async deliver(deliveryId: string): Promise<void> {
    const claimed = await this.prisma.webhookDelivery.updateMany({
      where: {
        id: deliveryId,
        status: {
          in: [
            WebhookDeliveryStatus.PENDING,
            WebhookDeliveryStatus.FAILED,
          ],
        },
        attempts: { lt: this.maxAttempts() },
      },
      data: {
        status: WebhookDeliveryStatus.PROCESSING,
        attempts: { increment: 1 },
        lastError: null,
      },
    });
    if (!claimed.count) return;

    const delivery = await this.prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
      include: {
        subscription: true,
        outboxEvent: true,
      },
    });
    if (!delivery) return;

    try {
      const allowLocalhost = this.config.get<string>('NODE_ENV') !== 'production';
      const endpoint = await assertSafeWebhookTarget(
        delivery.subscription.url,
        allowLocalhost,
      );
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const secret = this.security.decryptSensitiveValue(
        delivery.subscription.encryptedSecret,
        `webhook-secret:${delivery.subscription.id}`,
      );
      const body = JSON.stringify({
        id: delivery.outboxEvent.id,
        event: delivery.outboxEvent.eventType,
        createdAt: delivery.outboxEvent.createdAt.toISOString(),
        organizationId: delivery.outboxEvent.organizationId,
        workspaceId: delivery.outboxEvent.workspaceId,
        aggregate: {
          type: delivery.outboxEvent.aggregateType,
          id: delivery.outboxEvent.aggregateId,
        },
        data: delivery.outboxEvent.payload,
      });
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'sessions-webhooks/1.0',
          'x-sessions-event': delivery.eventType,
          'x-sessions-delivery': delivery.id,
          'x-sessions-timestamp': timestamp,
          'x-sessions-signature': signWebhookPayload(secret, timestamp, body),
        },
        body,
        redirect: 'error',
        signal: AbortSignal.timeout(
          this.config.get<number>('WEBHOOK_REQUEST_TIMEOUT_MS', 10_000),
        ),
      });
      const responseBody = (await response.text().catch(() => '')).slice(0, 4000);
      if (response.ok) {
        await this.prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: WebhookDeliveryStatus.DELIVERED,
            lastStatusCode: response.status,
            lastResponseBody: responseBody || null,
            lastError: null,
            deliveredAt: new Date(),
          },
        });
        return;
      }
      await this.fail(
        delivery.id,
        delivery.attempts,
        `HTTP ${response.status}`,
        response.status,
        responseBody,
      );
    } catch (error: unknown) {
      await this.fail(
        delivery.id,
        delivery.attempts,
        error instanceof Error ? error.message : 'Unknown webhook delivery error',
      );
    }
  }

  private async fail(
    deliveryId: string,
    attempts: number,
    message: string,
    statusCode?: number,
    responseBody?: string,
  ): Promise<void> {
    const delaySeconds = Math.min(900, 2 ** Math.min(attempts, 9));
    await this.prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: WebhookDeliveryStatus.FAILED,
        ...(statusCode !== undefined ? { lastStatusCode: statusCode } : {}),
        ...(responseBody !== undefined
          ? { lastResponseBody: responseBody || null }
          : {}),
        lastError: message.slice(0, 4000),
        nextAttemptAt: new Date(Date.now() + delaySeconds * 1000),
      },
    });
  }

  private maxAttempts(): number {
    return this.config.get<number>('WEBHOOK_MAX_ATTEMPTS', 8);
  }

  private eventTypes(value: Prisma.JsonValue): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }
}
