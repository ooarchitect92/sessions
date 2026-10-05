import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ArtifactStatus,
  BookingStatus,
  RegistrationStatus,
  SessionStatus,
} from '@prisma/client';
import type { Principal } from '../common/auth/principal';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { AnalyticsRangeQuery } from './dto/analytics-range.query';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 366;

function dayKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly database: TenantDatabaseService) {}

  async workspace(principal: Principal, query: AnalyticsRangeQuery) {
    const { from, to } = this.resolveRange(query);
    return this.database.run(principal, async (transaction) => {
      const sessionWhere = { startsAt: { gte: from, lt: to } };
      const createdWhere = { createdAt: { gte: from, lt: to } };

      const [
        sessions,
        registrations,
        reservations,
        chatMessages,
        polls,
        pollAnswers,
        questions,
        questionVotes,
        recordings,
        transcripts,
        summaries,
      ] = await Promise.all([
        transaction.session.findMany({
          where: sessionWhere,
          select: {
            id: true,
            title: true,
            startsAt: true,
            durationMinutes: true,
            kind: true,
            status: true,
          },
          orderBy: { startsAt: 'asc' },
        }),
        transaction.eventRegistration.findMany({
          where: { registeredAt: { gte: from, lt: to } },
          select: { registeredAt: true, status: true },
        }),
        transaction.bookingReservation.findMany({
          where: createdWhere,
          select: { createdAt: true, status: true },
        }),
        transaction.chatMessage.findMany({
          where: createdWhere,
          select: { createdAt: true },
        }),
        transaction.poll.findMany({
          where: createdWhere,
          select: { createdAt: true },
        }),
        transaction.pollAnswer.findMany({
          where: createdWhere,
          select: { createdAt: true },
        }),
        transaction.question.findMany({
          where: createdWhere,
          select: { createdAt: true, status: true },
        }),
        transaction.questionVote.findMany({
          where: createdWhere,
          select: { createdAt: true },
        }),
        transaction.recording.findMany({
          where: createdWhere,
          select: { status: true, durationSeconds: true },
        }),
        transaction.transcript.findMany({
          where: createdWhere,
          select: { status: true },
        }),
        transaction.memorySummary.findMany({
          where: createdWhere,
          select: { status: true, reviewedAt: true },
        }),
      ]);

      const completedStatuses = new Set<SessionStatus>([
        SessionStatus.ENDED,
        SessionStatus.PROCESSING,
        SessionStatus.READY,
      ]);
      const completedSessions = sessions.filter((item) =>
        completedStatuses.has(item.status),
      );
      const meetingMinutes = completedSessions.reduce(
        (sum, item) => sum + item.durationMinutes,
        0,
      );
      const attended = registrations.filter(
        (item) => item.status === RegistrationStatus.ATTENDED,
      ).length;
      const noShowRegistrations = registrations.filter(
        (item) => item.status === RegistrationStatus.NO_SHOW,
      ).length;
      const confirmedBookingStatuses: BookingStatus[] = [
        BookingStatus.CONFIRMED,
        BookingStatus.COMPLETED,
      ];
      const confirmedBookings = reservations.filter((item) =>
        confirmedBookingStatuses.includes(item.status),
      ).length;
      const noShowBookings = reservations.filter(
        (item) => item.status === BookingStatus.NO_SHOW,
      ).length;
      const engagementActions =
        chatMessages.length +
        pollAnswers.length +
        questions.length +
        questionVotes.length;

      const trend = this.buildTrend(from, to);
      for (const item of sessions) {
        const bucket = trend.get(dayKey(item.startsAt));
        if (bucket) bucket.sessions += 1;
      }
      for (const item of registrations) {
        const bucket = trend.get(dayKey(item.registeredAt));
        if (bucket) bucket.registrations += 1;
      }
      for (const item of reservations) {
        const bucket = trend.get(dayKey(item.createdAt));
        if (bucket) bucket.bookings += 1;
      }
      for (const item of chatMessages) {
        const bucket = trend.get(dayKey(item.createdAt));
        if (bucket) bucket.engagement += 1;
      }
      for (const item of pollAnswers) {
        const bucket = trend.get(dayKey(item.createdAt));
        if (bucket) bucket.engagement += 1;
      }
      for (const item of questions) {
        const bucket = trend.get(dayKey(item.createdAt));
        if (bucket) bucket.engagement += 1;
      }
      for (const item of questionVotes) {
        const bucket = trend.get(dayKey(item.createdAt));
        if (bucket) bucket.engagement += 1;
      }

      return {
        range: { from: from.toISOString(), to: to.toISOString() },
        metrics: {
          sessions: sessions.length,
          completedSessions: completedSessions.length,
          meetingMinutes,
          meetingHours: Math.round((meetingMinutes / 60) * 10) / 10,
          eventRegistrations: registrations.length,
          attendedRegistrations: attended,
          registrationNoShowRate:
            registrations.length === 0
              ? 0
              : Math.round((noShowRegistrations / registrations.length) * 1000) / 10,
          bookingReservations: reservations.length,
          confirmedBookings,
          bookingNoShowRate:
            reservations.length === 0
              ? 0
              : Math.round((noShowBookings / reservations.length) * 1000) / 10,
          chatMessages: chatMessages.length,
          polls: polls.length,
          pollAnswers: pollAnswers.length,
          questions: questions.length,
          questionVotes: questionVotes.length,
          engagementActions,
          readyRecordings: recordings.filter(
            (item) => item.status === ArtifactStatus.READY,
          ).length,
          recordingMinutes:
            Math.round(
              recordings.reduce(
                (sum, item) => sum + (item.durationSeconds ?? 0),
                0,
              ) / 6,
            ) / 10,
          readyTranscripts: transcripts.filter(
            (item) => item.status === ArtifactStatus.READY,
          ).length,
          readySummaries: summaries.filter(
            (item) => item.status === ArtifactStatus.READY,
          ).length,
          reviewedSummaries: summaries.filter((item) => item.reviewedAt).length,
        },
        trend: [...trend.values()],
        recentSessions: sessions
          .slice()
          .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())
          .slice(0, 8),
      };
    });
  }

  async session(principal: Principal, id: string) {
    return this.database.run(principal, async (transaction) => {
      const session = await transaction.session.findUnique({
        where: { id },
        include: {
          event: {
            include: {
              registrations: {
                select: { status: true, checkedInAt: true },
              },
            },
          },
          recording: {
            select: {
              status: true,
              durationSeconds: true,
              completedAt: true,
            },
          },
          transcript: {
            select: { status: true, completedAt: true },
          },
          memorySummary: {
            select: { status: true, reviewedAt: true, completedAt: true },
          },
          _count: {
            select: {
              chatMessages: true,
              polls: true,
              questions: true,
            },
          },
          polls: {
            select: {
              id: true,
              _count: { select: { answers: true, options: true } },
            },
          },
          questions: {
            select: {
              id: true,
              status: true,
              _count: { select: { votes: true } },
            },
          },
        },
      });
      if (!session) throw new NotFoundException('Session not found');

      const pollAnswers = session.polls.reduce(
        (sum, poll) => sum + poll._count.answers,
        0,
      );
      const questionVotes = session.questions.reduce(
        (sum, question) => sum + question._count.votes,
        0,
      );
      const registrations = session.event?.registrations ?? [];
      const attended = registrations.filter(
        (item) =>
          item.status === RegistrationStatus.ATTENDED || item.checkedInAt,
      ).length;

      return {
        session: {
          id: session.id,
          title: session.title,
          kind: session.kind,
          status: session.status,
          startsAt: session.startsAt,
          durationMinutes: session.durationMinutes,
        },
        attendance: {
          registrations: registrations.length,
          attended,
          noShows: registrations.filter(
            (item) => item.status === RegistrationStatus.NO_SHOW,
          ).length,
        },
        engagement: {
          chatMessages: session._count.chatMessages,
          polls: session._count.polls,
          pollAnswers,
          questions: session._count.questions,
          questionVotes,
          total:
            session._count.chatMessages +
            pollAnswers +
            session._count.questions +
            questionVotes,
        },
        artifacts: {
          recording: session.recording,
          transcript: session.transcript,
          summary: session.memorySummary,
        },
      };
    });
  }

  private resolveRange(query: AnalyticsRangeQuery): { from: Date; to: Date } {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - 30 * DAY_MS);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) {
      throw new BadRequestException('Invalid analytics date range');
    }
    if (from >= to) {
      throw new BadRequestException('Analytics range start must be before end');
    }
    if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) {
      throw new BadRequestException('Analytics range cannot exceed 366 days');
    }
    return { from, to };
  }

  private buildTrend(from: Date, to: Date) {
    const result = new Map<
      string,
      {
        date: string;
        sessions: number;
        registrations: number;
        bookings: number;
        engagement: number;
      }
    >();
    const cursor = new Date(
      Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
    );
    while (cursor < to) {
      const date = dayKey(cursor);
      result.set(date, {
        date,
        sessions: 0,
        registrations: 0,
        bookings: 0,
        engagement: 0,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return result;
  }
}
