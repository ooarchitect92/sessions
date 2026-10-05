import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type Principal, hasAnyRole } from '../common/auth/principal';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { ENGAGEMENT_EVENT, EngagementService } from '../engagement/engagement.service';
import { OutboxService } from '../outbox/outbox.service';

const ATTENDANCE_READ_ROLES = ['OWNER', 'ADMIN', 'HOST', 'ANALYST'] as const;

@Injectable()
export class AttendanceService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly engagement: EngagementService,
    private readonly outbox: OutboxService,
  ) {}

  async join(
    principal: Principal,
    sessionId: string,
    occurredAt = new Date(),
  ) {
    return this.database.run(principal, async (transaction) => {
      const session = await transaction.session.findUnique({
        where: { id: sessionId },
        select: { id: true, event: { select: { id: true } } },
      });
      if (!session) throw new NotFoundException('Session not found');

      const lockKey = `attendance:${sessionId}:${principal.userId}`;
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;

      const existing = await transaction.sessionAttendanceInterval.findFirst({
        where: {
          sessionId,
          userId: principal.userId,
          leftAt: null,
        },
        orderBy: { joinedAt: 'desc' },
      });
      if (existing) {
        return transaction.sessionAttendanceInterval.update({
          where: { id: existing.id },
          data: { lastHeartbeatAt: occurredAt },
        });
      }

      const interval = await transaction.sessionAttendanceInterval.create({
        data: {
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          sessionId,
          userId: principal.userId,
          joinedAt: occurredAt,
          lastHeartbeatAt: occurredAt,
        },
      });

      if (session.event) {
        const checkedIn = await transaction.eventRegistration.updateMany({
          where: {
            eventId: session.event.id,
            email: principal.email,
            status: 'REGISTERED',
          },
          data: {
            status: 'ATTENDED',
            checkedInAt: occurredAt,
          },
        });
        if (checkedIn.count > 0) {
          await this.outbox.enqueue(transaction, principal, {
            aggregateType: 'event',
            aggregateId: session.event.id,
            eventType: 'event.registration.attended',
            payload: {
              eventId: session.event.id,
              sessionId,
              userId: principal.userId,
              email: principal.email,
              checkedInAt: occurredAt.toISOString(),
            },
          });
        }
      }

      await this.engagement.record(transaction, principal, {
        sessionId,
        eventType: ENGAGEMENT_EVENT.PARTICIPANT_JOINED,
        sourceType: 'attendance_interval',
        sourceId: interval.id,
        occurredAt,
        properties: {
          webinar: Boolean(session.event),
        },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'session_attendance',
        aggregateId: interval.id,
        eventType: 'participant.joined',
        payload: {
          attendanceIntervalId: interval.id,
          sessionId,
          userId: principal.userId,
          displayName: principal.displayName,
          occurredAt: occurredAt.toISOString(),
        },
      });

      return interval;
    });
  }

  async heartbeat(
    principal: Principal,
    sessionId: string,
    occurredAt = new Date(),
  ): Promise<void> {
    await this.database.run(principal, async (transaction) => {
      const updated = await transaction.sessionAttendanceInterval.updateMany({
        where: {
          sessionId,
          userId: principal.userId,
          leftAt: null,
        },
        data: { lastHeartbeatAt: occurredAt },
      });
      if (updated.count === 0) {
        const lockKey = `attendance:${sessionId}:${principal.userId}`;
        await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
        const existing = await transaction.sessionAttendanceInterval.findFirst({
          where: {
            sessionId,
            userId: principal.userId,
            leftAt: null,
          },
          select: { id: true },
        });
        if (!existing) {
          const session = await transaction.session.findUnique({
            where: { id: sessionId },
            select: { id: true },
          });
          if (!session) throw new NotFoundException('Session not found');
          const interval = await transaction.sessionAttendanceInterval.create({
            data: {
              organizationId: principal.organizationId,
              workspaceId: principal.workspaceId,
              sessionId,
              userId: principal.userId,
              joinedAt: occurredAt,
              lastHeartbeatAt: occurredAt,
            },
          });
          await this.engagement.record(transaction, principal, {
            sessionId,
            eventType: ENGAGEMENT_EVENT.PARTICIPANT_JOINED,
            sourceType: 'attendance_interval',
            sourceId: interval.id,
            occurredAt,
            properties: {
              recoveredFromHeartbeat: true,
            },
          });
          await this.outbox.enqueue(transaction, principal, {
            aggregateType: 'session_attendance',
            aggregateId: interval.id,
            eventType: 'participant.joined',
            payload: {
              attendanceIntervalId: interval.id,
              sessionId,
              userId: principal.userId,
              displayName: principal.displayName,
              occurredAt: occurredAt.toISOString(),
              recoveredFromHeartbeat: true,
            },
          });
        }
      }
    });
  }

  async leave(
    principal: Principal,
    sessionId: string,
    occurredAt = new Date(),
  ) {
    return this.database.run(principal, async (transaction) => {
      const lockKey = `attendance:${sessionId}:${principal.userId}`;
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;

      const interval = await transaction.sessionAttendanceInterval.findFirst({
        where: {
          sessionId,
          userId: principal.userId,
          leftAt: null,
        },
        orderBy: { joinedAt: 'desc' },
      });
      if (!interval) return null;

      const leftAt =
        occurredAt < interval.joinedAt ? interval.joinedAt : occurredAt;
      const closed = await transaction.sessionAttendanceInterval.update({
        where: { id: interval.id },
        data: {
          leftAt,
          lastHeartbeatAt: leftAt,
        },
      });

      const durationSeconds = Math.max(
        0,
        Math.round((leftAt.getTime() - interval.joinedAt.getTime()) / 1000),
      );
      await this.engagement.record(transaction, principal, {
        sessionId,
        eventType: ENGAGEMENT_EVENT.PARTICIPANT_LEFT,
        sourceType: 'attendance_interval',
        sourceId: interval.id,
        occurredAt: leftAt,
        properties: { durationSeconds },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'session_attendance',
        aggregateId: interval.id,
        eventType: 'participant.left',
        payload: {
          attendanceIntervalId: interval.id,
          sessionId,
          userId: principal.userId,
          displayName: principal.displayName,
          joinedAt: interval.joinedAt.toISOString(),
          occurredAt: leftAt.toISOString(),
          durationSeconds,
        },
      });

      return closed;
    });
  }

  async listSession(principal: Principal, sessionId: string) {
    if (!hasAnyRole(principal, ATTENDANCE_READ_ROLES)) {
      throw new ForbiddenException(
        'An owner, admin, host, or analyst role is required',
      );
    }

    return this.database.run(principal, async (transaction) => {
      const session = await transaction.session.findUnique({
        where: { id: sessionId },
        select: { id: true },
      });
      if (!session) throw new NotFoundException('Session not found');

      const intervals = await transaction.sessionAttendanceInterval.findMany({
        where: { sessionId },
        orderBy: [{ joinedAt: 'asc' }],
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
      });

      const now = new Date();
      const byUser = new Map<
        string,
        {
          user: (typeof intervals)[number]['user'];
          joinedAt: Date;
          lastLeftAt: Date | null;
          durationSeconds: number;
          intervals: number;
          active: boolean;
        }
      >();

      for (const interval of intervals) {
        const end = interval.leftAt ?? now;
        const durationSeconds = Math.max(
          0,
          Math.round((end.getTime() - interval.joinedAt.getTime()) / 1000),
        );
        const existing = byUser.get(interval.userId);
        if (!existing) {
          byUser.set(interval.userId, {
            user: interval.user,
            joinedAt: interval.joinedAt,
            lastLeftAt: interval.leftAt,
            durationSeconds,
            intervals: 1,
            active: interval.leftAt === null,
          });
          continue;
        }
        existing.durationSeconds += durationSeconds;
        existing.intervals += 1;
        existing.active ||= interval.leftAt === null;
        if (!existing.lastLeftAt || (interval.leftAt && interval.leftAt > existing.lastLeftAt)) {
          existing.lastLeftAt = interval.leftAt;
        }
      }

      return {
        sessionId,
        uniqueParticipants: byUser.size,
        totalAttendanceSeconds: [...byUser.values()].reduce(
          (sum, item) => sum + item.durationSeconds,
          0,
        ),
        participants: [...byUser.values()],
      };
    });
  }
}
