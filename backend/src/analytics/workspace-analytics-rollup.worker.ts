import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { EventStatus, SessionStatus } from '@prisma/client';
import { WorkerPrismaService } from '../database/worker-prisma.service';
import { mergeAttendanceRanges } from './attendance-math';

@Injectable()
export class WorkspaceAnalyticsRollupWorker {
  private readonly logger = new Logger(WorkspaceAnalyticsRollupWorker.name);
  private running = false;

  constructor(
    private readonly prisma: WorkerPrismaService,
    private readonly config: ConfigService,
  ) {}

  @Interval(5 * 60 * 1000)
  async runCycle(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const lookbackDays = this.config.get<number>(
        'ANALYTICS_ROLLUP_LOOKBACK_DAYS',
        2,
      );
      const batchSize = this.config.get<number>(
        'ANALYTICS_ROLLUP_WORKSPACE_BATCH',
        100,
      );
      let cursor: string | undefined;

      while (true) {
        const workspaces = await this.prisma.workspace.findMany({
          select: { id: true, organizationId: true },
          orderBy: { id: 'asc' },
          take: batchSize,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        if (workspaces.length === 0) break;

        for (const workspace of workspaces) {
          for (let offset = 0; offset < lookbackDays; offset += 1) {
            const date = utcDayOffset(-offset);
            await this.computeDay(
              workspace.organizationId,
              workspace.id,
              date,
            );
          }
        }

        cursor = workspaces.at(-1)?.id;
        if (workspaces.length < batchSize || !cursor) break;
      }
    } catch (error: unknown) {
      this.logger.error(
        'Workspace analytics rollup cycle failed',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
  }

  private async computeDay(
    organizationId: string,
    workspaceId: string,
    date: Date,
  ): Promise<void> {
    const start = new Date(date);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

    const [
      sessionsScheduled,
      intervals,
      engagementEvents,
      eventsScheduled,
      registrationsCreated,
      bookingReservationsCreated,
    ] = await Promise.all([
      this.prisma.session.count({
        where: {
          organizationId,
          workspaceId,
          startsAt: { gte: start, lt: end },
          status: {
            notIn: [SessionStatus.DRAFT, SessionStatus.CANCELLED],
          },
        },
      }),
      this.prisma.attendanceInterval.findMany({
        where: {
          organizationId,
          workspaceId,
          joinedAt: { lt: end },
          OR: [{ leftAt: null }, { leftAt: { gte: start } }],
        },
        select: {
          sessionId: true,
          userId: true,
          joinedAt: true,
          leftAt: true,
          lastSeenAt: true,
        },
      }),
      this.prisma.engagementEvent.count({
        where: {
          organizationId,
          workspaceId,
          occurredAt: { gte: start, lt: end },
        },
      }),
      this.prisma.event.count({
        where: {
          organizationId,
          workspaceId,
          startsAt: { gte: start, lt: end },
          status: {
            notIn: [EventStatus.DRAFT, EventStatus.CANCELLED],
          },
        },
      }),
      this.prisma.eventRegistration.count({
        where: {
          organizationId,
          workspaceId,
          registeredAt: { gte: start, lt: end },
        },
      }),
      this.prisma.bookingReservation.count({
        where: {
          organizationId,
          workspaceId,
          createdAt: { gte: start, lt: end },
        },
      }),
    ]);

    const grouped = new Map<string, Array<{ start: number; end: number }>>();
    const attendeeIds = new Set<string>();
    for (const interval of intervals) {
      const clippedStart = Math.max(start.getTime(), interval.joinedAt.getTime());
      const effectiveEnd = interval.leftAt ?? interval.lastSeenAt;
      const clippedEnd = Math.min(end.getTime(), effectiveEnd.getTime());
      if (clippedEnd <= clippedStart) continue;
      attendeeIds.add(interval.userId);
      const key = `${interval.sessionId}:${interval.userId}`;
      const ranges = grouped.get(key) ?? [];
      ranges.push({ start: clippedStart, end: clippedEnd });
      grouped.set(key, ranges);
    }

    let attendanceSeconds = 0;
    for (const ranges of grouped.values()) {
      attendanceSeconds += Math.round(mergeAttendanceRanges(ranges) / 1000);
    }

    await this.prisma.workspaceAnalyticsDaily.upsert({
      where: {
        workspaceId_date: {
          workspaceId,
          date: start,
        },
      },
      update: {
        sessionsScheduled,
        uniqueAttendees: attendeeIds.size,
        attendanceSeconds: BigInt(attendanceSeconds),
        engagementEvents,
        eventsScheduled,
        registrationsCreated,
        bookingReservationsCreated,
        computedAt: new Date(),
      },
      create: {
        organizationId,
        workspaceId,
        date: start,
        sessionsScheduled,
        uniqueAttendees: attendeeIds.size,
        attendanceSeconds: BigInt(attendanceSeconds),
        engagementEvents,
        eventsScheduled,
        registrationsCreated,
        bookingReservationsCreated,
        computedAt: new Date(),
      },
    });
  }
}

function utcDayOffset(offsetDays: number): Date {
  const now = new Date();
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + offsetDays,
    ),
  );
}
