import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EngagementEventKind,
  Prisma,
  RegistrationStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import {
  HOST_ROLES,
  hasAnyRole,
  type Principal,
} from '../common/auth/principal';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { mergeAttendanceRanges } from './attendance-math';
import type { WorkspaceAnalyticsRangeDto } from './dto/workspace-analytics-range.dto';
import { analyticsRowsToCsv } from './workspace-analytics-csv';

type IntervalLike = {
  userId: string;
  joinedAt: Date;
  leftAt: Date | null;
};

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
  ) {}

  async openAttendance(
    principal: Principal,
    sessionId: string,
    connectionId: string,
  ) {
    const now = new Date();
    return this.database.run(principal, async (transaction) => {
      const session = await transaction.session.findUnique({
        where: { id: sessionId },
        include: { event: { select: { id: true } } },
      });
      if (!session) throw new NotFoundException('Session not found');

      let eventRegistrationId: string | null = null;
      if (session.event) {
        const registration = await transaction.eventRegistration.findFirst({
          where: {
            eventId: session.event.id,
            email: principal.email.toLowerCase(),
            status: {
              in: [
                RegistrationStatus.REGISTERED,
                RegistrationStatus.ATTENDED,
              ],
            },
          },
        });
        if (registration) {
          eventRegistrationId = registration.id;
          if (registration.status !== RegistrationStatus.ATTENDED) {
            await transaction.eventRegistration.update({
              where: { id: registration.id },
              data: {
                status: RegistrationStatus.ATTENDED,
                checkedInAt: registration.checkedInAt ?? now,
              },
            });
          } else if (!registration.checkedInAt) {
            await transaction.eventRegistration.update({
              where: { id: registration.id },
              data: { checkedInAt: now },
            });
          }
        }
      }

      return transaction.attendanceInterval.upsert({
        where: {
          sessionId_connectionId: {
            sessionId,
            connectionId,
          },
        },
        update: {
          lastSeenAt: now,
          leftAt: null,
          eventRegistrationId,
        },
        create: {
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          sessionId,
          userId: principal.userId,
          eventRegistrationId,
          connectionId,
          joinedAt: now,
          lastSeenAt: now,
        },
      });
    });
  }

  async closeAttendance(
    principal: Principal,
    sessionId: string,
    connectionId: string,
  ): Promise<void> {
    const now = new Date();
    await this.database.run(principal, async (transaction) => {
      await transaction.attendanceInterval.updateMany({
        where: {
          sessionId,
          connectionId,
          userId: principal.userId,
          leftAt: null,
        },
        data: {
          leftAt: now,
          lastSeenAt: now,
        },
      });
    });
  }

  async recordEngagement(
    principal: Principal,
    sessionId: string,
    kind: EngagementEventKind,
    referenceType?: string,
    referenceId?: string,
    metadata: Prisma.InputJsonObject = {},
  ) {
    return this.database.run(principal, async (transaction) => {
      const session = await transaction.session.findUnique({
        where: { id: sessionId },
        select: { id: true },
      });
      if (!session) throw new NotFoundException('Session not found');

      return transaction.engagementEvent.create({
        data: {
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          sessionId,
          userId: principal.userId,
          kind,
          referenceType: referenceType ?? null,
          referenceId: referenceId ?? null,
          metadata,
        },
      });
    });
  }

  async sessionAnalytics(principal: Principal, sessionId: string) {
    this.assertAnalyst(principal);
    return this.database.run(principal, async (transaction) => {
      const session = await transaction.session.findUnique({
        where: { id: sessionId },
        select: {
          id: true,
          title: true,
          startsAt: true,
          durationMinutes: true,
          status: true,
        },
      });
      if (!session) throw new NotFoundException('Session not found');

      const [intervals, events] = await Promise.all([
        transaction.attendanceInterval.findMany({
          where: { sessionId },
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                email: true,
                avatarUrl: true,
              },
            },
          },
          orderBy: [{ userId: 'asc' }, { joinedAt: 'asc' }],
        }),
        transaction.engagementEvent.groupBy({
          by: ['kind'],
          where: { sessionId },
          _count: { _all: true },
        }),
      ]);

      return {
        session,
        attendance: this.summarizeAttendance(intervals),
        engagement: Object.fromEntries(
          events.map((event) => [event.kind, event._count._all]),
        ),
      };
    });
  }

  async eventAnalytics(principal: Principal, eventId: string) {
    this.assertAnalyst(principal);
    return this.database.run(principal, async (transaction) => {
      const event = await transaction.event.findUnique({
        where: { id: eventId },
        select: {
          id: true,
          title: true,
          startsAt: true,
          sessionId: true,
          registrations: {
            select: {
              id: true,
              status: true,
              checkedInAt: true,
            },
          },
        },
      });
      if (!event) throw new NotFoundException('Event not found');

      const statusCounts = event.registrations.reduce<Record<string, number>>(
        (counts, registration) => {
          counts[registration.status] = (counts[registration.status] ?? 0) + 1;
          return counts;
        },
        {},
      );

      if (!event.sessionId) {
        return {
          event: {
            id: event.id,
            title: event.title,
            startsAt: event.startsAt,
            sessionId: null,
          },
          registrations: {
            total: event.registrations.length,
            byStatus: statusCounts,
          },
          attendance: this.emptyAttendance(),
          engagement: {},
        };
      }

      const [intervals, events] = await Promise.all([
        transaction.attendanceInterval.findMany({
          where: { sessionId: event.sessionId },
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                email: true,
                avatarUrl: true,
              },
            },
          },
          orderBy: [{ userId: 'asc' }, { joinedAt: 'asc' }],
        }),
        transaction.engagementEvent.groupBy({
          by: ['kind'],
          where: { sessionId: event.sessionId },
          _count: { _all: true },
        }),
      ]);

      return {
        event: {
          id: event.id,
          title: event.title,
          startsAt: event.startsAt,
          sessionId: event.sessionId,
        },
        registrations: {
          total: event.registrations.length,
          byStatus: statusCounts,
        },
        attendance: this.summarizeAttendance(intervals),
        engagement: Object.fromEntries(
          events.map((entry) => [entry.kind, entry._count._all]),
        ),
      };
    });
  }

  async workspaceAnalytics(
    principal: Principal,
    input: WorkspaceAnalyticsRangeDto,
  ) {
    this.assertAnalyst(principal);
    const range = this.analyticsRange(input);

    return this.database.run(principal, async (transaction) => {
      const rows = await transaction.workspaceAnalyticsDaily.findMany({
        where: {
          date: { gte: range.from, lt: range.toExclusive },
        },
        orderBy: { date: 'asc' },
      });
      const projected = rows.map((row) => this.projectRollup(row));
      return {
        range: {
          from: range.fromLabel,
          to: range.toLabel,
          days: range.days,
        },
        totals: projected.reduce(
          (totals, row) => ({
            sessionsScheduled:
              totals.sessionsScheduled + row.sessionsScheduled,
            uniqueAttendees: totals.uniqueAttendees + row.uniqueAttendees,
            attendanceSeconds:
              totals.attendanceSeconds + row.attendanceSeconds,
            engagementEvents:
              totals.engagementEvents + row.engagementEvents,
            eventsScheduled: totals.eventsScheduled + row.eventsScheduled,
            registrationsCreated:
              totals.registrationsCreated + row.registrationsCreated,
            bookingReservationsCreated:
              totals.bookingReservationsCreated +
              row.bookingReservationsCreated,
          }),
          {
            sessionsScheduled: 0,
            uniqueAttendees: 0,
            attendanceSeconds: 0,
            engagementEvents: 0,
            eventsScheduled: 0,
            registrationsCreated: 0,
            bookingReservationsCreated: 0,
          },
        ),
        lastComputedAt:
          rows.length > 0
            ? new Date(
                Math.max(...rows.map((row) => row.computedAt.getTime())),
              )
            : null,
        days: projected,
      };
    });
  }

  async exportWorkspaceAnalytics(
    principal: Principal,
    input: WorkspaceAnalyticsRangeDto,
  ) {
    this.assertAnalyst(principal);
    const range = this.analyticsRange(input);

    return this.database.run(principal, async (transaction) => {
      const rows = await transaction.workspaceAnalyticsDaily.findMany({
        where: {
          date: { gte: range.from, lt: range.toExclusive },
        },
        orderBy: { date: 'asc' },
      });
      const projected = rows.map((row) => this.projectRollup(row));

      await this.audit.record(transaction, principal, {
        action: 'analytics.workspace.exported',
        resourceType: 'workspace',
        resourceId: principal.workspaceId,
        metadata: {
          from: range.fromLabel,
          to: range.toLabel,
          rowCount: projected.length,
          format: 'csv',
          aggregateOnly: true,
        },
      });

      return {
        filename: `sessions-workspace-analytics-${range.fromLabel}-${range.toLabel}.csv`,
        contentType: 'text/csv; charset=utf-8',
        csv: analyticsRowsToCsv(projected),
      };
    });
  }

  private projectRollup(row: {
    date: Date;
    sessionsScheduled: number;
    uniqueAttendees: number;
    attendanceSeconds: bigint;
    engagementEvents: number;
    eventsScheduled: number;
    registrationsCreated: number;
    bookingReservationsCreated: number;
    computedAt: Date;
  }) {
    return {
      date: row.date.toISOString().slice(0, 10),
      sessionsScheduled: row.sessionsScheduled,
      uniqueAttendees: row.uniqueAttendees,
      attendanceSeconds: Number(row.attendanceSeconds),
      engagementEvents: row.engagementEvents,
      eventsScheduled: row.eventsScheduled,
      registrationsCreated: row.registrationsCreated,
      bookingReservationsCreated: row.bookingReservationsCreated,
      computedAt: row.computedAt,
    };
  }

  private analyticsRange(input: WorkspaceAnalyticsRangeDto) {
    const today = new Date();
    const todayUtc = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate(),
      ),
    );
    const to = input.to ? this.parseDateOnly(input.to) : todayUtc;
    const from = input.from
      ? this.parseDateOnly(input.from)
      : new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000);
    if (from > to) {
      throw new BadRequestException('Analytics from date must not be after to date');
    }
    const days =
      Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    if (days > 366) {
      throw new BadRequestException('Analytics range cannot exceed 366 days');
    }
    return {
      from,
      to,
      toExclusive: new Date(to.getTime() + 24 * 60 * 60 * 1000),
      fromLabel: from.toISOString().slice(0, 10),
      toLabel: to.toISOString().slice(0, 10),
      days,
    };
  }

  private parseDateOnly(value: string): Date {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    ) {
      throw new BadRequestException('Analytics dates must be valid YYYY-MM-DD values');
    }
    return date;
  }

  private summarizeAttendance<
    T extends IntervalLike & {
      user: {
        id: string;
        displayName: string;
        email: string;
        avatarUrl: string | null;
      };
      eventRegistrationId: string | null;
      connectionId: string;
    },
  >(intervals: T[]) {
    const now = new Date();
    const grouped = new Map<string, T[]>();
    for (const interval of intervals) {
      const existing = grouped.get(interval.userId) ?? [];
      existing.push(interval);
      grouped.set(interval.userId, existing);
    }

    const participants = [...grouped.entries()].map(([userId, rows]) => {
      const durationMs = mergeAttendanceRanges(
        rows.map((row) => ({
          start: row.joinedAt.getTime(),
          end: (row.leftAt ?? now).getTime(),
        })),
      );

      const first = rows[0];
      if (!first) {
        throw new Error('attendance_group_invariant');
      }
      return {
        userId,
        displayName: first.user.displayName,
        email: first.user.email,
        avatarUrl: first.user.avatarUrl,
        eventRegistrationId:
          rows.find((row) => row.eventRegistrationId)?.eventRegistrationId ??
          null,
        firstJoinedAt: new Date(
          Math.min(...rows.map((row) => row.joinedAt.getTime())),
        ),
        lastLeftAt: rows.some((row) => row.leftAt === null)
          ? null
          : new Date(
              Math.max(
                ...rows.map((row) => row.leftAt?.getTime() ?? row.joinedAt.getTime()),
              ),
            ),
        active: rows.some((row) => row.leftAt === null),
        connectionCount: rows.length,
        attendanceSeconds: Math.round(durationMs / 1000),
      };
    });

    const totalAttendanceSeconds = participants.reduce(
      (total, participant) => total + participant.attendanceSeconds,
      0,
    );

    return {
      uniqueAttendees: participants.length,
      activeAttendees: participants.filter((participant) => participant.active)
        .length,
      totalAttendanceSeconds,
      averageAttendanceSeconds: participants.length
        ? Math.round(totalAttendanceSeconds / participants.length)
        : 0,
      participants,
    };
  }

  private emptyAttendance() {
    return {
      uniqueAttendees: 0,
      activeAttendees: 0,
      totalAttendanceSeconds: 0,
      averageAttendanceSeconds: 0,
      participants: [],
    };
  }

  private assertAnalyst(principal: Principal): void {
    if (!hasAnyRole(principal, HOST_ROLES) && !principal.roles.includes('ANALYST')) {
      throw new ForbiddenException('A host or analyst role is required');
    }
  }
}
