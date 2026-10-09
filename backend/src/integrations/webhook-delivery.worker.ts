import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { Prisma } from '@prisma/client';
import { createHmac, randomUUID } from 'node:crypto';
import { WorkerPrismaService } from '../database/worker-prisma.service';
import { IntegrationsService } from './integrations.service';

type Delivery = {
  id: string;
  subscription_id: string;
  endpoint_url: string;
  secret_ciphertext: string;
  event_type: string;
  payload: Prisma.JsonValue;
  attempts: number;
};

@Injectable()
export class WebhookDeliveryWorker {
  private readonly logger = new Logger(WebhookDeliveryWorker.name);
  private readonly workerId = 'webhook-' + randomUUID();
  private running = false;

  constructor(
    private readonly prisma: WorkerPrismaService,
    private readonly integrations: IntegrationsService,
  ) {}

  @Interval(2000)
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.materializePublishedEvents();
      const deliveries = await this.claimBatch();
      for (const delivery of deliveries) {
        await this.deliver(delivery);
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

  private async materializePublishedEvents(): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      [
        'INSERT INTO webhook_deliveries (',
        '  organization_id, workspace_id, subscription_id, outbox_event_id, event_type, payload',
        ')',
        'SELECT oe.organization_id, oe.workspace_id, ws.id, oe.id, oe.event_type, oe.payload',
        'FROM outbox_events oe',
        'JOIN webhook_subscriptions ws',
        '  ON ws.organization_id = oe.organization_id',
        ' AND ws.workspace_id = oe.workspace_id',
        ' AND ws.active = TRUE',
        ' AND oe.event_type = ANY(ws.event_types)',
        "WHERE oe.published_at IS NOT NULL",
        "  AND oe.created_at >= NOW() - INTERVAL '7 days'",
        'ON CONFLICT (subscription_id, outbox_event_id) DO NOTHING',
      ].join('\n'),
    );
  }

  private claimBatch(): Promise<Delivery[]> {
    return this.prisma.$queryRaw<Delivery[]>`
      UPDATE webhook_deliveries AS d
      SET status = 'PROCESSING',
          locked_at = NOW(),
          locked_by = ${this.workerId},
          attempts = d.attempts + 1,
          updated_at = NOW()
      FROM webhook_subscriptions ws
      WHERE d.id IN (
        SELECT candidate.id
        FROM webhook_deliveries candidate
        JOIN webhook_subscriptions candidate_ws ON candidate_ws.id = candidate.subscription_id
        WHERE candidate.status IN ('PENDING', 'FAILED')
          AND candidate.dead_lettered_at IS NULL
          AND candidate.available_at <= NOW()
          AND candidate.attempts < 8
          AND candidate_ws.active = TRUE
          AND (candidate.locked_at IS NULL OR candidate.locked_at < NOW() - INTERVAL '5 minutes')
        ORDER BY candidate.created_at
        LIMIT 25
        FOR UPDATE OF candidate SKIP LOCKED
      )
        AND ws.id = d.subscription_id
      RETURNING d.id, d.subscription_id, ws.endpoint_url, ws.secret_ciphertext,
                d.event_type, d.payload, d.attempts
    `;
  }

  private async deliver(delivery: Delivery): Promise<void> {
    const body = JSON.stringify({
      id: delivery.id,
      type: delivery.event_type,
      createdAt: new Date().toISOString(),
      data: delivery.payload,
    });
    const secret = this.integrations.decryptSigningSecret(delivery.secret_ciphertext);
    const signature = createHmac('sha256', secret).update(body).digest('hex');

    try {
      await this.integrations.assertSafeEndpoint(delivery.endpoint_url);
      const response = await fetch(delivery.endpoint_url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'Sessions-Webhooks/1.0',
          'x-sessions-event': delivery.event_type,
          'x-sessions-delivery': delivery.id,
          'x-sessions-signature': 'sha256=' + signature,
        },
        body,
        signal: AbortSignal.timeout(10_000),
        redirect: 'error',
      });

      if (!response.ok) {
        throw new Error('Webhook endpoint returned HTTP ' + response.status);
      }

      await this.prisma.$executeRaw`
        UPDATE webhook_deliveries
        SET status = 'DELIVERED',
            response_status = ${response.status},
            delivered_at = NOW(),
            locked_at = NULL,
            locked_by = NULL,
            last_error = NULL,
            updated_at = NOW()
        WHERE id = ${delivery.id}::uuid
      `;
      await this.prisma.$executeRaw`
        UPDATE webhook_subscriptions
        SET last_success_at = NOW(), updated_at = NOW()
        WHERE id = ${delivery.subscription_id}::uuid
      `;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message.slice(0, 4000) : 'Unknown webhook delivery error';
      const terminal = delivery.attempts >= 8;
      const delaySeconds = Math.min(3600, 2 ** Math.min(delivery.attempts, 10));

      await this.prisma.$executeRaw`
        UPDATE webhook_deliveries
        SET status = ${terminal ? 'DEAD_LETTER' : 'FAILED'},
            available_at = NOW() + (${delaySeconds}::text || ' seconds')::interval,
            dead_lettered_at = ${terminal ? new Date() : null},
            locked_at = NULL,
            locked_by = NULL,
            last_error = ${message},
            updated_at = NOW()
        WHERE id = ${delivery.id}::uuid
      `;
      await this.prisma.$executeRaw`
        UPDATE webhook_subscriptions
        SET last_failure_at = NOW(), updated_at = NOW()
        WHERE id = ${delivery.subscription_id}::uuid
      `;
    }
  }
}