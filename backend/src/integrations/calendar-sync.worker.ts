import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { CalendarSyncStatus } from '@prisma/client';
import { WorkerPrismaService } from '../database/worker-prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { CalendarIntegrationsService } from './calendar-integrations.service';

@Injectable()
export class CalendarSyncWorker {
  private readonly logger = new Logger(CalendarSyncWorker.name);
  private running = false;

  constructor(
    private readonly prisma: WorkerPrismaService,
    private readonly config: ConfigService,
    private readonly calendars: CalendarIntegrationsService,
    private readonly outbox: OutboxService,
  ) {}

  @Interval(4000)
  async runCycle(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const pending = await this.prisma.calendarEventSync.findMany({
        where: {
          status: CalendarSyncStatus.PENDING,
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
        },
        orderBy: { createdAt: 'asc' },
        take: this.config.get<number>('CALENDAR_SYNC_WORKER_BATCH_SIZE', 10),
      });

      for (const item of pending) {
        await this.process(item.id);
      }
    } catch (error: unknown) {
      this.logger.error(
        'Calendar sync worker cycle failed',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
  }

  private async process(syncId: string): Promise<void> {
    const claimed = await this.prisma.calendarEventSync.updateMany({
      where: { id: syncId, status: CalendarSyncStatus.PENDING },
      data: {
        status: CalendarSyncStatus.PROCESSING,
        attempts: { increment: 1 },
        lastAttemptAt: new Date(),
        failureCode: null,
      },
    });
    if (claimed.count === 0) return;

    const sync = await this.prisma.calendarEventSync.findUnique({
      where: { id: syncId },
      include: {
        connection: true,
        reservation: {
          include: { session: true, bookingPage: true },
        },
      },
    });
    if (!sync) return;

    try {
      const result = await this.calendars.syncProviderEvent({
        connection: sync.connection,
        action: sync.action,
        providerEventId: sync.providerEventId,
        reservation: sync.reservation,
      });

      await this.prisma.$transaction(async (transaction) => {
        const updated = await transaction.calendarEventSync.update({
          where: { id: sync.id },
          data: {
            status: CalendarSyncStatus.SYNCED,
            providerEventId: result.providerEventId,
            syncedAt: new Date(),
            nextAttemptAt: null,
            failureCode: null,
            version: { increment: 1 },
          },
        });
        await this.outbox.enqueue(
          transaction,
          {
            organizationId: updated.organizationId,
            workspaceId: updated.workspaceId,
          },
          {
            aggregateType: 'calendar_event_sync',
            aggregateId: updated.id,
            eventType: 'calendar.event.synced',
            payload: {
              calendarEventSyncId: updated.id,
              reservationId: updated.reservationId,
              connectionId: updated.connectionId,
              provider: updated.provider,
              action: updated.action,
              providerEventId: updated.providerEventId,
            },
          },
        );
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown calendar provider error';
      const maxAttempts = this.config.get<number>('CALENDAR_SYNC_MAX_ATTEMPTS', 8);
      const terminal = sync.attempts >= maxAttempts;
      const delaySeconds = Math.min(15 * 2 ** Math.max(sync.attempts - 1, 0), 3600);
      await this.prisma.$transaction(async (transaction) => {
        const failed = await transaction.calendarEventSync.update({
          where: { id: sync.id },
          data: {
            status: terminal
              ? CalendarSyncStatus.FAILED
              : CalendarSyncStatus.PENDING,
            failureCode: message.slice(0, 2000),
            nextAttemptAt: terminal
              ? null
              : new Date(Date.now() + delaySeconds * 1000),
            version: { increment: 1 },
          },
        });
        if (terminal) {
          await this.outbox.enqueue(
            transaction,
            {
              organizationId: failed.organizationId,
              workspaceId: failed.workspaceId,
            },
            {
              aggregateType: 'calendar_event_sync',
              aggregateId: failed.id,
              eventType: 'calendar.event.sync_failed',
              payload: {
                calendarEventSyncId: failed.id,
                reservationId: failed.reservationId,
                provider: failed.provider,
                action: failed.action,
                attempts: failed.attempts,
                failureCode: failed.failureCode,
              },
            },
          );
        }
      });
      this.logger.warn(
        `Calendar sync ${sync.id} failed on attempt ${sync.attempts}: ${message}`,
      );
    }
  }
}
