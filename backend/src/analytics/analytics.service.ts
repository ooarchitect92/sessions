import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ArtifactStatus,
  BookingStatus,
  RegistrationStatus,
  SessionStatus,
  type Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { hasAnyRole, type Principal } from '../common/auth/principal';
import { TenantDatabaseService } from '../database/tenant-database.service';
import {
  buildDailyAnalyticsSeries,
  csvEscape,
} from './analytics-rollup';

const ANALYTICS_ROLES = ['OWNER', 'ADMIN', 'HOST', 'ANALYST'] as const;

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
  ) {}

  async overview(principal: Principal, days: number) {
    this.assertAnalyticsAccess(principal);
    return this.database.run(principal, (transaction) =>
      this.collectOverview(transaction, days),
    );
  }

  async session(principal: Principal, sessionId: string) {
    this.assertAnalyticsAccess(principal);
    return this.database.run(principal, async (transaction) => {
      const session = await transaction.session.findUnique({
        where: { id: sessionId },
        select: {
          id: true,
          title: true,
          startsAt: true,
          durationMinutes: true,
          kind: true,
          status: true,
          recording: {
            select: {
              status: true,
              durationSeconds: true,
            },
          },
          transcript: {
            select: {
              status: true,
              language: true,
            },
          },
          memorySummary: {
            select: {
              status: true,
              reviewedAt: true,
            },
          },
          event: {
            select: {
              id: true,
              registrations: {
                select: {
                  status: true,
                },
              },
            },
          },
        },
      });
      if (!session) throw new NotFoundException('Session not found');

      const polls = await transaction.poll.findMany({
        where: { sessionId },
        select: { id: true, status: true },
      });
      const pollIds = polls.map((poll) => poll.id);
      const [chatMessages, questions, pollAnswers, attendanceIntervals] =
        await Promise.all([
        transaction.chatMessage.count({
          where: { sessionId, deletedAt: null },
        }),
        transaction.question.count({ where: { sessionId } }),
        pollIds.length
          ? transaction.pollAnswer.count({
              where: { pollId: { in: pollIds } },
            })
          : Promise.resolve(0),
        transaction.sessionAttendanceInterval.findMany({
          where: { sessionId },
          select: {
            userId: true,
            joinedAt: true,
            leftAt: true,
            lastHeartbeatAt: true,
          },
        }),
      ]);

      const attendanceByUser = new Set(
        attendanceIntervals.map((interval) => interval.userId),
      );
      const attendanceSeconds = attendanceIntervals.reduce((sum, interval) => {
        const endAt = interval.leftAt ?? interval.lastHeartbeatAt;
        return (
          sum +
          Math.max(
            0,
            Math.round((endAt.getTime() - interval.joinedAt.getTime()) / 1000),
          )
        );
      }, 0);

      const registrations = session.event?.registrations ?? [];
      return {
        session: {
          id: session.id,
          title: session.title,
          startsAt: session.startsAt,
          durationMinutes: session.durationMinutes,
          kind: session.kind,
          status: session.status,
        },
        audience: {
          uniqueParticipants: attendanceByUser.size,
          attendanceSeconds,
          registrations: registrations.length,
          attended: registrations.filter(
            (item) => item.status === RegistrationStatus.ATTENDED,
          ).length,
          noShows: registrations.filter(
            (item) => item.status === RegistrationStatus.NO_SHOW,
          ).length,
          waitlisted: registrations.filter(
            (item) => item.status === RegistrationStatus.WAITLISTED,
          ).length,
        },
        engagement: {
          chatMessages,
          polls: polls.length,
          liveOrClosedPolls: polls.filter((poll) => poll.status !== 'DRAFT').length,
          pollAnswers,
          questions,
          totalActions: chatMessages + pollAnswers + questions,
        },
        artifacts: {
          recordingStatus: session.recording?.status ?? null,
          recordingDurationSeconds: session.recording?.durationSeconds ?? null,
          transcriptStatus: session.transcript?.status ?? null,
          transcriptLanguage: session.transcript?.language ?? null,
          summaryStatus: session.memorySummary?.status ?? null,
          summaryReviewedAt: session.memorySummary?.reviewedAt ?? null,
        },
      };
    });
  }

  async exportWorkspace(principal: Principal, days: number) {
    this.assertAnalyticsAccess(principal);
    return this.database.run(principal, async (transaction) => {
      const overview = await this.collectOverview(transaction, days);
      const lines = [
        ['metric', 'value'],
        ['range_days', overview.range.days],
        ['sessions', overview.sessions.total],
        ['completed_sessions', overview.sessions.completed],
        ['scheduled_session_minutes', overview.sessions.scheduledMinutes],
        ['event_registrations', overview.events.registrations],
        ['event_attended', overview.events.attended],
        ['event_waitlisted', overview.events.waitlisted],
        ['booking_reservations', overview.bookings.total],
        ['booking_confirmed', overview.bookings.confirmed],
        ['booking_cancelled', overview.bookings.cancelled],
        ['chat_messages', overview.engagement.chatMessages],
        ['poll_answers', overview.engagement.pollAnswers],
        ['questions', overview.engagement.questions],
        ['participant_sessions', overview.attendance.participantSessions],
        ['attendance_seconds', overview.attendance.totalSeconds],
        ['engagement_actions', overview.engagement.totalActions],
        ['ready_recordings', overview.memory.readyRecordings],
        ['ready_summaries', overview.memory.readySummaries],
        [],
        ['date', 'sessions', 'registrations', 'bookings'],
        ...overview.daily.map((point) => [
          point.date,
          point.sessions,
          point.registrations,
          point.bookings,
        ]),
      ];
      const content = lines
        .map((row) => row.map((cell) => csvEscape(cell ?? '')).join(','))
        .join('\n');

      await this.audit.record(transaction, principal, {
        action: 'analytics.exported',
        resourceType: 'workspace',
        resourceId: principal.workspaceId,
        metadata: {
          format: 'csv',
          days,
          generatedAt: new Date().toISOString(),
        },
      });

      return {
        filename: `workspace-analytics-${new Date().toISOString().slice(0, 10)}.csv`,
        contentType: 'text/csv;charset=utf-8',
        content,
      };
    });
  }

  private async collectOverview(
    transaction: Prisma.TransactionClient,
    days: number,
  ) {
    const end = new Date();
    const since = new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    since.setUTCHours(0, 0, 0, 0);

    const [
      sessions,
      registrations,
      reservations,
      chatMessages,
      pollAnswers,
      questions,
      readyRecordings,
      readySummaries,
      attendanceIntervals,
    ] = await Promise.all([
      transaction.session.findMany({
        where: { startsAt: { gte: since, lte: end } },
        select: {
          id: true,
          startsAt: true,
          durationMinutes: true,
          status: true,
          kind: true,
        },
      }),
      transaction.eventRegistration.findMany({
        where: { registeredAt: { gte: since, lte: end } },
        select: { registeredAt: true, status: true },
      }),
      transaction.bookingReservation.findMany({
        where: { createdAt: { gte: since, lte: end } },
        select: { createdAt: true, status: true },
      }),
      transaction.chatMessage.count({
        where: { createdAt: { gte: since, lte: end }, deletedAt: null },
      }),
      transaction.pollAnswer.count({
        where: { createdAt: { gte: since, lte: end } },
      }),
      transaction.question.count({
        where: { createdAt: { gte: since, lte: end } },
      }),
      transaction.recording.count({
        where: {
          status: ArtifactStatus.READY,
          completedAt: { gte: since, lte: end },
        },
      }),
      transaction.memorySummary.count({
        where: {
          status: ArtifactStatus.READY,
          completedAt: { gte: since, lte: end },
        },
      }),
      transaction.sessionAttendanceInterval.findMany({
        where: { joinedAt: { gte: since, lte: end } },
        select: {
          sessionId: true,
          userId: true,
          joinedAt: true,
          leftAt: true,
          lastHeartbeatAt: true,
        },
      }),
    ]);

    const uniqueParticipantSessions = new Set(
      attendanceIntervals.map(
        (interval) => `${interval.sessionId}:${interval.userId}`,
      ),
    );
    const attendanceSeconds = attendanceIntervals.reduce((sum, interval) => {
      const endAt = interval.leftAt ?? interval.lastHeartbeatAt;
      return (
        sum +
        Math.max(
          0,
          Math.round((endAt.getTime() - interval.joinedAt.getTime()) / 1000),
        )
      );
    }, 0);

    const completedStatuses: SessionStatus[] = [
      SessionStatus.ENDED,
      SessionStatus.PROCESSING,
      SessionStatus.READY,
    ];
    const confirmedBookings = reservations.filter(
      (item) =>
        item.status === BookingStatus.CONFIRMED ||
        item.status === BookingStatus.COMPLETED,
    ).length;

    return {
      range: {
        days,
        since,
        until: end,
      },
      sessions: {
        total: sessions.length,
        completed: sessions.filter((item) =>
          completedStatuses.includes(item.status),
        ).length,
        webinars: sessions.filter((item) => item.kind === 'WEBINAR').length,
        scheduledMinutes: sessions.reduce(
          (sum, item) => sum + item.durationMinutes,
          0,
        ),
      },
      events: {
        registrations: registrations.length,
        attended: registrations.filter(
          (item) => item.status === RegistrationStatus.ATTENDED,
        ).length,
        noShows: registrations.filter(
          (item) => item.status === RegistrationStatus.NO_SHOW,
        ).length,
        waitlisted: registrations.filter(
          (item) => item.status === RegistrationStatus.WAITLISTED,
        ).length,
      },
      bookings: {
        total: reservations.length,
        confirmed: confirmedBookings,
        cancelled: reservations.filter(
          (item) => item.status === BookingStatus.CANCELLED,
        ).length,
        completed: reservations.filter(
          (item) => item.status === BookingStatus.COMPLETED,
        ).length,
      },
      attendance: {
        participantSessions: uniqueParticipantSessions.size,
        intervalCount: attendanceIntervals.length,
        totalSeconds: attendanceSeconds,
      },
      engagement: {
        chatMessages,
        pollAnswers,
        questions,
        totalActions: chatMessages + pollAnswers + questions,
      },
      memory: {
        readyRecordings,
        readySummaries,
      },
      daily: buildDailyAnalyticsSeries(
        since,
        days,
        sessions.map((item) => ({ at: item.startsAt })),
        registrations.map((item) => ({ at: item.registeredAt })),
        reservations.map((item) => ({ at: item.createdAt })),
      ),
    };
  }

  private assertAnalyticsAccess(principal: Principal): void {
    if (!hasAnyRole(principal, ANALYTICS_ROLES)) {
      throw new ForbiddenException(
        'An owner, admin, host, or analyst role is required',
      );
    }
  }
}
