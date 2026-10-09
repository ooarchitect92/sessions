import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { Prisma, WebhookDeliveryStatus } from '@prisma/client';
import { SecurityService } from '../auth/security.service';
import { WorkerPrismaService } from '../database/worker-prisma.service';
import { WebhookHttpClient } from './webhook-http.client';
import { signWebhookPayload } from './webhook-signature';

type MaterializationRow = {
  outbox_event_id: string;
  organization_id: string;
  workspace_id: string;
  subscription_id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: Prisma.JsonValue;
  occurred_at: Date;
};

@Injectable()
export class WebhookDeliveryWorker {
  private readonly logger = new Logger(WebhookDeliveryWorker.name);
  private running = false;

  constructor(
    private readonly prisma: WorkerPrismaService,
    private readonly config: ConfigService,
    private readonly security: SecurityService,
    private readonly http: WebhookHttpClient,
  ) {}

  @Interval(5_000)
  async runCycle(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.recoverStaleClaims();
      await this.materialize();
      await this.deliver();
    } catch (error: unknown) {
      this.logger.error(
        'Webhook delivery cycle failed',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
  }

  private async recoverStaleClaims(): Promise<void> {
    const staleBefore = new Date(Date.now() - 10 * 60 * 1000);
    await this.prisma.webhookDelivery.updateMany({
      where: {
        status: WebhookDeliveryStatus.SENDING,
        updatedAt: { lt: staleBefore },
      },
      data: {
        status: WebhookDeliveryStatus.FAILED,
        nextAttemptAt: new Date(),
        lastError: 'stale_sending_claim_recovered',
      },
    });
  }

  private async materialize(): Promise<void> {
    const sql = [
      'SELECT event.id AS outbox_event_id,',
      'event.organization_id, event.workspace_id,',
      'subscription.id AS subscription_id,',
      'event.event_type, event.aggregate_type, event.aggregate_id,',
      'event.payload, event.created_at AS occurred_at',
      'FROM outbox_events AS event',
      'JOIN webhook_subscriptions AS subscription',
      'ON subscription.organization_id = event.organization_id',
      'AND subscription.workspace_id = event.workspace_id',
      'AND subscription.enabled = true',
      'AND subscription.event_types ? event.event_type',
      'AND event.created_at >= subscription.created_at',
      'WHERE event.published_at IS NOT NULL',
      'AND NOT EXISTS (',
      'SELECT 1 FROM webhook_deliveries AS delivery',
      'WHERE delivery.subscription_id = subscription.id',
      'AND delivery.outbox_event_id = event.id',
      ')',
      'ORDER BY event.created_at ASC',
      'LIMIT 200',
    ].join(' ');

    const rows = await this.prisma.$queryRawUnsafe<MaterializationRow[]>(sql);
    for (const row of rows) {
      const envelope = {
        id: row.outbox_event_id,
        type: row.event_type,
        occurredAt: row.occurred_at.toISOString(),
        aggregate: {
          type: row.aggregate_type,
          id: row.aggregate_id,
        },
        data: row.payload,
      };

      await this.prisma.webhookDelivery.upsert({
        where: {
          subscriptionId_outboxEventId: {
            subscriptionId: row.subscription_id,
            outboxEventId: row.outbox_event_id,
          },
        },
        update: {},
        create: {
          organizationId: row.organization_id,
          workspaceId: row.workspace_id,
          subscriptionId: row.subscription_id,
          outboxEventId: row.outbox_event_id,
          eventType: row.event_type,
          payload: envelope as Prisma.InputJsonValue,
        },
      });
    }
  }

  private async deliver(): Promise<void> {
    const now = new Date();
    const deliveries = await this.prisma.webhookDelivery.findMany({
      where: {
        status: {
          in: [WebhookDeliveryStatus.PENDING, WebhookDeliveryStatus.FAILED],
        },
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
        subscription: { enabled: true },
      },
      include: { subscription: true },
      orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
      take: 20,
    });

    for (const delivery of deliveries) {
      const claimed = await this.prisma.webhookDelivery.updateMany({
        where: {
          id: delivery.id,
          status: {
            in: [WebhookDeliveryStatus.PENDING, WebhookDeliveryStatus.FAILED],
          },
        },
        data: {
          status: WebhookDeliveryStatus.SENDING,
          lastAttemptAt: new Date(),
        },
      });
      if (claimed.count === 0) continue;

      const body = JSON.stringify(delivery.payload);
      const timestamp = Math.floor(Date.now() / 1000);
      const secret = this.security.decryptSensitiveValue(
        delivery.subscription.secretCiphertext,
        'webhook-signing:' + delivery.subscription.id,
      );
      const signature = signWebhookPayload(secret, timestamp, body);

      try {
        const response = await this.http.post(
          delivery.subscription.endpointUrl,
          body,
          {
            'user-agent': 'Sessions-Webhook/1.0',
            'x-sessions-delivery': delivery.id,
            'x-sessions-event': delivery.eventType,
            'x-sessions-timestamp': String(timestamp),
            'x-sessions-signature': 'sha256=' + signature,
          },
        );
        if (response.statusCode < 200 || response.statusCode >= 300) {
          throw new WebhookHttpStatusError(
            response.statusCode,
            response.bodySnippet,
          );
        }

        await this.prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: WebhookDeliveryStatus.DELIVERED,
            attempts: { increment: 1 },
            nextAttemptAt: null,
            responseStatus: response.statusCode,
            responseBodySnippet: response.bodySnippet || null,
            lastError: null,
            deliveredAt: new Date(),
          },
        });
      } catch (error: unknown) {
        await this.handleFailure(delivery.id, error);
      }
    }
  }

  private async handleFailure(
    deliveryId: string,
    error: unknown,
  ): Promise<void> {
    const maxAttempts = this.config.get<number>('WEBHOOK_MAX_ATTEMPTS', 8);
    const baseDelaySeconds = this.config.get<number>(
      'WEBHOOK_RETRY_BASE_SECONDS',
      30,
    );
    const current = await this.prisma.webhookDelivery.findUniqueOrThrow({
      where: { id: deliveryId },
    });
    const attempts = current.attempts + 1;
    const terminal = attempts >= maxAttempts;
    const statusError =
      error instanceof WebhookHttpStatusError ? error : undefined;
    const message =
      error instanceof Error
        ? error.message.slice(0, 1000)
        : 'unknown_webhook_error';

    await this.prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: terminal
          ? WebhookDeliveryStatus.DEAD_LETTER
          : WebhookDeliveryStatus.FAILED,
        attempts,
        nextAttemptAt: terminal
          ? null
          : new Date(
              Date.now() +
                Math.min(
                  6 * 60 * 60,
                  baseDelaySeconds * 2 ** Math.max(0, attempts - 1),
                ) *
                  1000,
            ),
        responseStatus: statusError?.statusCode ?? null,
        responseBodySnippet: statusError?.bodySnippet || null,
        lastError: message,
      },
    });
  }
}

class WebhookHttpStatusError extends Error {
  constructor(
    readonly statusCode: number,
    readonly bodySnippet: string,
  ) {
    super('webhook_http_status_' + statusCode);
  }
}
