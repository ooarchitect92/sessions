import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../infrastructure/redis.service';

interface ClaimedMarketingLeadEvent {
  id: string;
  lead_id: string;
  event_type: string;
  payload: Prisma.JsonValue;
  attempts: number;
}

@Injectable()
export class MarketingLeadOutboxService {
  private readonly logger = new Logger(MarketingLeadOutboxService.name);
  private readonly workerId = `marketing-${randomUUID()}`;
  private dispatching = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Interval(1000)
  async dispatch(): Promise<void> {
    if (this.dispatching) return;
    this.dispatching = true;
    try {
      const events = await this.claimBatch();
      for (const event of events) {
        await this.publish(event);
      }
    } catch (error: unknown) {
      this.logger.error(
        'Marketing lead outbox dispatch cycle failed',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.dispatching = false;
    }
  }

  private async claimBatch(): Promise<ClaimedMarketingLeadEvent[]> {
    return this.prisma.$queryRaw<ClaimedMarketingLeadEvent[]>`
      UPDATE marketing_lead_outbox_events AS event
      SET locked_at = NOW(), locked_by = ${this.workerId}, attempts = event.attempts + 1
      WHERE event.id IN (
        SELECT candidate.id
        FROM marketing_lead_outbox_events AS candidate
        WHERE candidate.published_at IS NULL
          AND candidate.dead_lettered_at IS NULL
          AND candidate.attempts < 12
          AND candidate.available_at <= NOW()
          AND (candidate.locked_at IS NULL OR candidate.locked_at < NOW() - INTERVAL '5 minutes')
        ORDER BY candidate.created_at
        LIMIT 50
        FOR UPDATE SKIP LOCKED
      )
      RETURNING event.id, event.lead_id, event.event_type, event.payload, event.attempts
    `;
  }

  private async publish(event: ClaimedMarketingLeadEvent): Promise<void> {
    try {
      await this.redis.xadd(
        'sessions.public.marketing',
        'MAXLEN',
        '~',
        100_000,
        '*',
        'id',
        event.id,
        'leadId',
        event.lead_id,
        'eventType',
        event.event_type,
        'payload',
        JSON.stringify(event.payload),
      );

      await this.prisma.marketingLeadOutboxEvent.update({
        where: { id: event.id },
        data: {
          publishedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          lastError: null,
        },
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message.slice(0, 4000) : 'Unknown publish error';
      const deadLettered = event.attempts >= 12;
      const delaySeconds = Math.min(300, 2 ** Math.min(event.attempts, 8));

      await this.prisma.marketingLeadOutboxEvent.update({
        where: { id: event.id },
        data: {
          lockedAt: null,
          lockedBy: null,
          lastError: message,
          ...(deadLettered
            ? { deadLetteredAt: new Date() }
            : { availableAt: new Date(Date.now() + delaySeconds * 1000) }),
        },
      });

      if (deadLettered) {
        this.logger.error(
          `Marketing lead outbox event ${event.id} moved to dead letter after 12 attempts`,
        );
      }
    }
  }
}
