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
    fromInput?: string,
    toInput?: string,
  ) {
    this.assertAnalyst(principal);
    const { from, to } = this.analyticsRange(fromInput, toInput);

    return this.database.run(principal, async (transaction) => {
      const [sessions, events, reservations] = await Promise.all([
        transaction.session.findMany({
          where: { startsAt: { gte: from, lte: to } },
          select: {
            id: true,
            title: true,
            startsAt: true,
            durationMinutes: true,
            status: true,
            attendanceIntervals: {
              select: { userId: true, joinedAt: true, leftAt: true },
            },
            engagementEvents: { select: { kind: true } },
          },
          orderBy: { startsAt: 'asc' },
          take: 1000,
        }),
        transaction.event.findMany({
          where: { startsAt: { gte: from, lte: to } },
          select: {
            id: true,
            registrations: { select: { status: true } },
          },
          take: 1000,
        }),
        transaction.bookingReservation.findMany({
          where: { startsAt: { gte: from, lte: to } },
          select: { id: true, status: true },
          take: 5000,
        }),
      ]);

      const trend = new Map<string, {
        date: string;
        sessions: number;
        uniqueAttendees: Set<string>;
        attendanceSeconds: number;
        engagementEvents: number;
      }>();
      const topSessions: Array<{
        id: string;
        title: string;
        startsAt: Date;
        uniqueAttendees: number;
        attendanceSeconds: number;
        engagementEvents: number;
      }> = [];
      const allAttendees = new Set<string>();
      let totalAttendanceSeconds = 0;
      let totalEngagementEvents = 0;

      for (const session of sessions) {
        const attendeeIds = new Set(session.attendanceIntervals.map((row) => row.userId));
        attendeeIds.forEach((id) => allAttendees.add(id));
        const attendanceSeconds = Math.round(
          session.attendanceIntervals.reduce((total, row) => {
            const end = row.leftAt ?? to;
            const boundedStart = Math.max(row.joinedAt.getTime(), from.getTime());
            const boundedEnd = Math.min(end.getTime(), to.getTime());
            return total + Math.max(0, boundedEnd - boundedStart);
          }, 0) / 1000,
        );
        const engagementCount = session.engagementEvents.length;
        totalAttendanceSeconds += attendanceSeconds;
        totalEngagementEvents += engagementCount;
        topSessions.push({
          id: session.id,
          title: session.title,
          startsAt: session.startsAt,
          uniqueAttendees: attendeeIds.size,
          attendanceSeconds,
          engagementEvents: engagementCount,
        });

        const date = session.startsAt.toISOString().slice(0, 10);
        const bucket = trend.get(date) ?? {
          date,
          sessions: 0,
          uniqueAttendees: new Set<string>(),
          attendanceSeconds: 0,
          engagementEvents: 0,
        };
        bucket.sessions += 1;
        attendeeIds.forEach((id) => bucket.uniqueAttendees.add(id));
        bucket.attendanceSeconds += attendanceSeconds;
        bucket.engagementEvents += engagementCount;
        trend.set(date, bucket);
      }

      const registrations = events.flatMap((event) => event.registrations);
      const attendedRegistrations = registrations.filter((item) => item.status === 'ATTENDED').length;
      const cancelledRegistrations = registrations.filter((item) => item.status === 'CANCELLED').length;
      const confirmedBookings = reservations.filter((item) => item.status === 'CONFIRMED' || item.status === 'COMPLETED').length;
      const cancelledBookings = reservations.filter((item) => item.status === 'CANCELLED').length;

      return {
        range: { from, to },
        overview: {
          sessions: sessions.length,
          completedSessions: sessions.filter((item) => ['ENDED', 'READY'].includes(item.status)).length,
          liveSessions: sessions.filter((item) => item.status === 'LIVE').length,
          uniqueAttendees: allAttendees.size,
          totalAttendanceSeconds,
          averageAttendanceSecondsPerSession: sessions.length
            ? Math.round(totalAttendanceSeconds / sessions.length)
            : 0,
          engagementEvents: totalEngagementEvents,
          eventRegistrations: registrations.length,
          eventAttendanceRate: registrations.length
            ? Number(((attendedRegistrations / registrations.length) * 100).toFixed(1))
            : 0,
          cancelledEventRegistrations: cancelledRegistrations,
          bookings: reservations.length,
          confirmedBookings,
          cancelledBookings,
          bookingConversionRate: reservations.length
            ? Number(((confirmedBookings / reservations.length) * 100).toFixed(1))
            : 0,
        },
        trend: [...trend.values()].map((bucket) => ({
          date: bucket.date,
          sessions: bucket.sessions,
          uniqueAttendees: bucket.uniqueAttendees.size,
          attendanceSeconds: bucket.attendanceSeconds,
          engagementEvents: bucket.engagementEvents,
        })),
        topSessions: topSessions
          .sort((a, b) =>
            b.uniqueAttendees - a.uniqueAttendees ||
            b.engagementEvents - a.engagementEvents ||
            b.attendanceSeconds - a.attendanceSeconds,
          )
          .slice(0, 10),
      };
    });
  }

  async workspaceExport(
    principal: Principal,
    fromInput?: string,
    toInput?: string,
  ) {
    this.assertAnalyst(principal);
    const { from, to } = this.analyticsRange(fromInput, toInput);

    return this.database.run(principal, async (transaction) => {
      const sessions = await transaction.session.findMany({
        where: { startsAt: { gte: from, lte: to } },
        select: {
          id: true,
          title: true,
          kind: true,
          status: true,
          startsAt: true,
          durationMinutes: true,
          attendanceIntervals: {
            select: { userId: true, joinedAt: true, leftAt: true },
          },
          engagementEvents: { select: { id: true } },
        },
        orderBy: { startsAt: 'asc' },
        take: 5000,
      });

      const rows = sessions.map((session) => {
        const attendeeIds = new Set(session.attendanceIntervals.map((item) => item.userId));
        const attendanceSeconds = Math.round(
          session.attendanceIntervals.reduce((total, item) => {
            const end = item.leftAt ?? to;
            return total + Math.max(0, Math.min(end.getTime(), to.getTime()) - Math.max(item.joinedAt.getTime(), from.getTime()));
          }, 0) / 1000,
        );
        return {
          sessionId: session.id,
          title: session.title,
          kind: session.kind,
          status: session.status,
          startsAt: session.startsAt.toISOString(),
          scheduledMinutes: session.durationMinutes,
          uniqueAttendees: attendeeIds.size,
          attendanceMinutes: Number((attendanceSeconds / 60).toFixed(1)),
          engagementEvents: session.engagementEvents.length,
        };
      });

      await this.audit.record(transaction, principal, {
        action: 'analytics.workspace_exported',
        resourceType: 'workspace',
        resourceId: principal.workspaceId,
        metadata: {
          from: from.toISOString(),
          to: to.toISOString(),
          rowCount: rows.length,
          format: 'csv',
        },
      });

      return {
        filename: `workspace-analytics-${from.toISOString().slice(0, 10)}-to-${to.toISOString().slice(0, 10)}.csv`,
        columns: [
          'sessionId',
          'title',
          'kind',
          'status',
          'startsAt',
          'scheduledMinutes',
          'uniqueAttendees',
          'attendanceMinutes',
          'engagementEvents',
        ],
        rows,
      };
    });
  }

  private analyticsRange(fromInput?: string, toInput?: string) {
    const to = toInput ? new Date(toInput) : new Date();
    const from = fromInput
      ? new Date(fromInput)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Analytics date range is invalid');
    }
    if (from >= to) {
      throw new BadRequestException('Analytics from date must be before to date');
    }
    const maxMs = 366 * 24 * 60 * 60 * 1000;
    if (to.getTime() - from.getTime() > maxMs) {
      throw new BadRequestException('Analytics date range cannot exceed 366 days');
    }
    return { from, to };
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
