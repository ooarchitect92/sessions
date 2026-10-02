import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { Principal } from '../common/auth/principal';
import { WorkerPrismaService } from '../database/worker-prisma.service';
import { RedisService } from '../infrastructure/redis.service';

interface ClaimedOutboxEvent {
  id: string;
  organization_id: string;
  workspace_id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  payload: Prisma.JsonValue;
  attempts: number;
}

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);
  private readonly workerId = `api-${randomUUID()}`;
  private dispatching = false;

  constructor(
    private readonly prisma: WorkerPrismaService,
    private readonly redis: RedisService,
  ) {}

  async enqueue(
    transaction: Prisma.TransactionClient,
    principal: Pick<Principal, 'organizationId' | 'workspaceId'>,
    event: {
      aggregateType: string;
      aggregateId: string;
      eventType: string;
      payload: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    await transaction.outboxEvent.create({
      data: {
        organizationId: principal.organizationId,
        workspaceId: principal.workspaceId,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        eventType: event.eventType,
        payload: event.payload,
      },
    });
  }

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
      this.logger.error('Outbox dispatch cycle failed', error instanceof Error ? error.stack : undefined);
    } finally {
      this.dispatching = false;
    }
  }

  private async claimBatch(): Promise<ClaimedOutboxEvent[]> {
    return this.prisma.$queryRaw<ClaimedOutboxEvent[]>`
      UPDATE outbox_events AS event
      SET locked_at = NOW(), locked_by = ${this.workerId}, attempts = event.attempts + 1
      WHERE event.id IN (
        SELECT candidate.id
        FROM outbox_events AS candidate
        WHERE candidate.published_at IS NULL
          AND candidate.dead_lettered_at IS NULL
          AND candidate.attempts < 12
          AND candidate.available_at <= NOW()
          AND (candidate.locked_at IS NULL OR candidate.locked_at < NOW() - INTERVAL '5 minutes')
        ORDER BY candidate.created_at
        LIMIT 50
        FOR UPDATE SKIP LOCKED
      )
      RETURNING event.id,
        event.organization_id,
        event.workspace_id,
        event.aggregate_type,
        event.aggregate_id,
        event.event_type,
        event.payload,
        event.attempts
    `;
  }

  private async publish(event: ClaimedOutboxEvent): Promise<void> {
    try {
      await this.redis.xadd(
        'sessions.events',
        'MAXLEN',
        '~',
        100_000,
        '*',
        'id',
        event.id,
        'organizationId',
        event.organization_id,
        'workspaceId',
        event.workspace_id,
        'aggregateType',
        event.aggregate_type,
        'aggregateId',
        event.aggregate_id,
        'eventType',
        event.event_type,
        'payload',
        JSON.stringify(event.payload),
      );
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: { publishedAt: new Date(), lockedAt: null, lockedBy: null, lastError: null },
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message.slice(0, 4000) : 'Unknown publish error';
      const deadLettered = event.attempts >= 12;
      const delaySeconds = Math.min(300, 2 ** Math.min(event.attempts, 8));
      await this.prisma.outboxEvent.update({
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
        this.logger.error(`Outbox event ${event.id} moved to dead letter after 12 attempts`);
      }
    }
  }
}
