import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import type { Prisma, WebhookDeliveryStatus } from '@prisma/client';
import { createHmac, randomUUID } from 'node:crypto';
import { WorkerPrismaService } from '../database/worker-prisma.service';
import { IntegrationsService } from './integrations.service';

interface ClaimedDelivery {
  id: string;
  subscription_id: string;
  event_type: string;
  payload: Prisma.JsonValue;
  attempts: number;
}

@Injectable()
export class WebhookDeliveryWorker {
  private readonly logger = new Logger(WebhookDeliveryWorker.name);
  private readonly workerId = 'webhook-' + randomUUID();
  private readonly maxAttempts: number;
  private readonly timeoutMs: number;
  private running = false;

  constructor(
    private readonly prisma: WorkerPrismaService,
    private readonly integrations: IntegrationsService,
    config: ConfigService,
  ) {
    this.maxAttempts = config.get<number>('WEBHOOK_MAX_ATTEMPTS') ?? 8;
    this.timeoutMs = config.get<number>('WEBHOOK_TIMEOUT_MS') ?? 10_000;
  }

  @Interval(1000)
  async dispatch(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (const delivery of await this.claimBatch()) await this.deliver(delivery);
    } catch (error: unknown) {
      this.logger.error('Webhook delivery cycle failed', error instanceof Error ? error.stack : undefined);
    } finally {
      this.running = false;
    }
  }

  private async claimBatch(): Promise<ClaimedDelivery[]> {
    return this.prisma.$queryRaw<ClaimedDelivery[]>`
      UPDATE webhook_deliveries AS delivery
      SET status = 'DELIVERING'::"WebhookDeliveryStatus",
          locked_at = NOW(),
          locked_by = ${this.workerId},
          attempts = delivery.attempts + 1
      WHERE delivery.id IN (
        SELECT candidate.id
        FROM webhook_deliveries AS candidate
        JOIN webhook_subscriptions AS subscription ON subscription.id = candidate.subscription_id
        WHERE candidate.status IN ('PENDING'::"WebhookDeliveryStatus", 'FAILED'::"WebhookDeliveryStatus")
          AND subscription.active = TRUE
          AND candidate.available_at <= NOW()
          AND (candidate.locked_at IS NULL OR candidate.locked_at < NOW() - INTERVAL '5 minutes')
        ORDER BY candidate.created_at
        LIMIT 25
        FOR UPDATE OF candidate SKIP LOCKED
      )
      RETURNING delivery.id, delivery.subscription_id, delivery.event_type, delivery.payload, delivery.attempts
    `;
  }

  private async deliver(delivery: ClaimedDelivery): Promise<void> {
    const subscription = await this.prisma.webhookSubscription.findUnique({ where: { id: delivery.subscription_id } });
    if (!subscription || !subscription.active) {
      await this.fail(delivery, 'Webhook subscription is inactive or missing', null, true);
      return;
    }
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = JSON.stringify({ id: delivery.id, type: delivery.event_type, createdAt: new Date().toISOString(), data: delivery.payload });
    const secret = this.integrations.decryptWebhookSecret(subscription.encryptedSecret);
    const signature = createHmac('sha256', secret).update(timestamp + '.' + body).digest('hex');

    try {
      const response = await fetch(subscription.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'Sessions-Webhooks/1.0',
          'x-sessions-delivery': delivery.id,
          'x-sessions-event': delivery.event_type,
          'x-sessions-timestamp': timestamp,
          'x-sessions-signature': 'v1=' + signature,
        },
        body,
        redirect: 'error',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) {
        await this.fail(delivery, 'Webhook endpoint returned HTTP ' + response.status, response.status, false);
        return;
      }
      await this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: 'DELIVERED', deliveredAt: new Date(), responseStatus: response.status, lockedAt: null, lockedBy: null, lastError: null },
      });
    } catch (error: unknown) {
      await this.fail(delivery, error instanceof Error ? error.message.slice(0, 4000) : 'Unknown webhook delivery error', null, false);
    }
  }

  private async fail(delivery: ClaimedDelivery, message: string, responseStatus: number | null, forceDeadLetter: boolean): Promise<void> {
    const terminal = forceDeadLetter || delivery.attempts >= this.maxAttempts;
    const status: WebhookDeliveryStatus = terminal ? 'DEAD_LETTER' : 'FAILED';
    const delaySeconds = Math.min(3600, 2 ** Math.min(delivery.attempts, 10));
    await this.prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status,
        responseStatus,
        lastError: message,
        lockedAt: null,
        lockedBy: null,
        ...(terminal ? {} : { availableAt: new Date(Date.now() + delaySeconds * 1000) }),
      },
    });
  }
}
