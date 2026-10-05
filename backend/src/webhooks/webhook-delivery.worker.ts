import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import {
  WebhookDeliveryStatus,
  type WebhookDelivery,
  type WebhookSubscription,
} from '@prisma/client';
import { WorkerPrismaService } from '../database/worker-prisma.service';
import { WebhookCryptoService } from './webhook-crypto.service';
import { WebhookEgressPolicyService } from './webhook-egress-policy.service';

type ClaimedDelivery = WebhookDelivery & {
  subscription: WebhookSubscription;
};

@Injectable()
export class WebhookDeliveryWorker {
  private readonly logger = new Logger(WebhookDeliveryWorker.name);
  private running = false;

  constructor(
    private readonly prisma: WorkerPrismaService,
    private readonly config: ConfigService,
    private readonly crypto: WebhookCryptoService,
    private readonly egressPolicy: WebhookEgressPolicyService,
  ) {}

  @Interval(1500)
  async runCycle(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.recoverStaleClaims();
      const deliveries = await this.claimBatch();
      for (const delivery of deliveries) {
        await this.deliver(delivery);
      }
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
        status: WebhookDeliveryStatus.DELIVERING,
        updatedAt: { lt: staleBefore },
      },
      data: {
        status: WebhookDeliveryStatus.RETRYING,
        nextAttemptAt: new Date(),
        lastError: 'worker_claim_recovered',
      },
    });
  }

  private async claimBatch(): Promise<ClaimedDelivery[]> {
    const maxAttempts = this.config.get<number>('WEBHOOK_MAX_ATTEMPTS', 8);
    const sql = [
      'UPDATE webhook_deliveries AS delivery',
      'SET status = \'DELIVERING\'::"WebhookDeliveryStatus",',
      '    attempt_count = delivery.attempt_count + 1,',
      '    updated_at = NOW()',
      'WHERE delivery.id IN (',
      '  SELECT candidate.id',
      '  FROM webhook_deliveries AS candidate',
      '  JOIN webhook_subscriptions AS subscription',
      '    ON subscription.id = candidate.subscription_id',
      '  WHERE candidate.status IN (',
      '      \'PENDING\'::"WebhookDeliveryStatus",',
      '      \'RETRYING\'::"WebhookDeliveryStatus"',
      '    )',
      '    AND candidate.next_attempt_at <= NOW()',
      '    AND candidate.attempt_count < $1',
      '    AND subscription.active = true',
      '  ORDER BY candidate.next_attempt_at, candidate.created_at',
      '  LIMIT 25',
      '  FOR UPDATE OF candidate SKIP LOCKED',
      ')',
      'RETURNING delivery.id',
    ].join('\n');

    const claimed = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      sql,
      maxAttempts,
    );
    if (claimed.length === 0) return [];

    return this.prisma.webhookDelivery.findMany({
      where: { id: { in: claimed.map((item) => item.id) } },
      include: { subscription: true },
    });
  }

  private async deliver(delivery: ClaimedDelivery): Promise<void> {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({
      id: delivery.outboxEventId,
      type: delivery.eventType,
      deliveryId: delivery.id,
      createdAt: delivery.createdAt.toISOString(),
      data: delivery.payload,
    });

    try {
      const target = await this.egressPolicy.assertDeliveryTarget(
        delivery.subscription.url,
      );
      const secret = this.crypto.decryptSecret(
        delivery.subscription.id,
        delivery.subscription.secretEncrypted,
      );
      const signature = this.crypto.signature(secret, timestamp, body);
      const timeoutMs = this.config.get<number>('WEBHOOK_TIMEOUT_MS', 10_000);
      const response = await fetch(target, {
        method: 'POST',
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'content-type': 'application/json',
          'user-agent': 'Sessions-Webhooks/1.0',
          'x-sessions-event-id': delivery.outboxEventId,
          'x-sessions-event-type': delivery.eventType,
          'x-sessions-delivery-id': delivery.id,
          'x-sessions-timestamp': timestamp,
          'x-sessions-signature': 'v1=' + signature,
        },
        body,
      });

      if (response.status < 200 || response.status >= 300) {
        const responseBody = await response.text().catch(() => '');
        throw new DeliveryHttpError(response.status, responseBody.slice(0, 1000));
      }

      await this.prisma.$transaction([
        this.prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: WebhookDeliveryStatus.SUCCEEDED,
            responseStatus: response.status,
            deliveredAt: new Date(),
            lastError: null,
          },
        }),
        this.prisma.webhookSubscription.update({
          where: { id: delivery.subscriptionId },
          data: {
            failureCount: 0,
            lastSuccessAt: new Date(),
          },
        }),
      ]);
    } catch (error: unknown) {
      await this.recordFailure(delivery, error);
    }
  }

  private async recordFailure(
    delivery: ClaimedDelivery,
    error: unknown,
  ): Promise<void> {
    const maxAttempts = this.config.get<number>('WEBHOOK_MAX_ATTEMPTS', 8);
    const terminal = delivery.attemptCount >= maxAttempts;
    const delaySeconds = Math.min(3600, 2 ** Math.min(delivery.attemptCount, 10));
    const responseStatus =
      error instanceof DeliveryHttpError ? error.status : null;
    const message =
      error instanceof Error
        ? error.message.slice(0, 4000)
        : 'Unknown webhook error';

    await this.prisma.$transaction([
      this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: terminal
            ? WebhookDeliveryStatus.FAILED
            : WebhookDeliveryStatus.RETRYING,
          responseStatus,
          lastError: message,
          nextAttemptAt: terminal
            ? delivery.nextAttemptAt
            : new Date(Date.now() + delaySeconds * 1000),
        },
      }),
      this.prisma.webhookSubscription.update({
        where: { id: delivery.subscriptionId },
        data: {
          failureCount: { increment: 1 },
          lastFailureAt: new Date(),
        },
      }),
    ]);

    if (terminal) {
      this.logger.warn(
        'Webhook delivery ' +
          delivery.id +
          ' failed permanently after ' +
          delivery.attemptCount +
          ' attempts',
      );
    }
  }
}

class DeliveryHttpError extends Error {
  constructor(
    readonly status: number,
    responseBody: string,
  ) {
    super(
      'Webhook endpoint returned ' +
        status +
        (responseBody ? ': ' + responseBody : ''),
    );
  }
}
