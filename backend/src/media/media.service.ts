import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BreakoutRoomStatus,
  EventPresenterRole,
  SessionKind,
  SessionStatus,
} from '@prisma/client';
import { AccessToken } from 'livekit-server-sdk';
import {
  HOST_ROLES,
  hasAnyRole,
  type Principal,
} from '../common/auth/principal';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { RecordingsService } from '../recordings/recordings.service';
import { SessionsService } from '../sessions/sessions.service';

const JOINABLE_SESSION_STATUSES = new Set<SessionStatus>([
  SessionStatus.DRAFT,
  SessionStatus.SCHEDULED,
  SessionStatus.LIVE,
]);

@Injectable()
export class MediaService {
  constructor(
    private readonly config: ConfigService,
    private readonly sessions: SessionsService,
    private readonly recordings: RecordingsService,
    private readonly database: TenantDatabaseService,
  ) {}

  async createJoinToken(
    principal: Principal,
    sessionId: string,
  ): Promise<{ url: string; token: string; expiresIn: number; expiresAt: string }> {
    const session = await this.sessions.getById(principal, sessionId);
    const isHost = hasAnyRole(principal, HOST_ROLES);
    if (session.status === SessionStatus.DRAFT && !isHost) {
      throw new ForbiddenException('Only a host can join a draft session');
    }
    if (!JOINABLE_SESSION_STATUSES.has(session.status)) {
      throw new ConflictException(
        `Media access is unavailable while session is ${session.status}`,
      );
    }

    await this.recordings.assertConsentAndPrepare(principal, session);

    const webinarRole =
      session.kind === SessionKind.WEBINAR
        ? await this.resolveWebinarRole(principal, sessionId)
        : null;
    const webinarCanModerate =
      webinarRole === EventPresenterRole.ORGANIZER ||
      webinarRole === EventPresenterRole.HOST ||
      webinarRole === EventPresenterRole.CO_HOST;
    const webinarCanPublish = webinarCanModerate || webinarRole === EventPresenterRole.SPEAKER;
    const canPublish =
      session.kind === SessionKind.WEBINAR
        ? webinarCanPublish || isHost
        : isHost ||
          (!principal.roles.includes('ANALYST') &&
            !principal.roles.includes('GUEST'));
    const roomAdmin = isHost || webinarCanModerate;
    const expiresIn = this.config.getOrThrow<number>('LIVEKIT_TOKEN_TTL_SECONDS');

    const accessToken = new AccessToken(
      this.config.getOrThrow<string>('LIVEKIT_API_KEY'),
      this.config.getOrThrow<string>('LIVEKIT_API_SECRET'),
      {
        identity: principal.userId,
        name: principal.displayName,
        ttl: expiresIn,
        metadata: JSON.stringify({
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          sessionId,
          roles: principal.roles,
          ...(webinarRole ? { webinarRole } : {}),
        }),
      },
    );
    accessToken.addGrant({
      room: session.livekitRoomName,
      roomJoin: true,
      roomAdmin,
      canPublish,
      canSubscribe: true,
      canPublishData: true,
    });

    return {
      url: this.config.getOrThrow<string>('LIVEKIT_URL'),
      token: await accessToken.toJwt(),
      expiresIn,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
  }

  async createBreakoutJoinToken(
    principal: Principal,
    sessionId: string,
    breakoutRoomId: string,
  ): Promise<{ url: string; token: string; expiresIn: number; expiresAt: string }> {
    const session = await this.sessions.getById(principal, sessionId);
    const isHost = hasAnyRole(principal, HOST_ROLES);
    if (!JOINABLE_SESSION_STATUSES.has(session.status)) {
      throw new ConflictException(
        `Media access is unavailable while session is ${session.status}`,
      );
    }

    const breakout = await this.database.run(principal, async (transaction) => {
      const room = await transaction.breakoutRoom.findFirst({
        where: { id: breakoutRoomId, sessionId },
        include: {
          assignments: {
            where: { userId: principal.userId },
            select: { id: true },
          },
        },
      });
      if (!room) throw new ForbiddenException('Breakout room is unavailable');
      if (room.status !== BreakoutRoomStatus.ACTIVE) {
        throw new ConflictException('Breakout room is not active');
      }
      if (!isHost && room.assignments.length === 0) {
        throw new ForbiddenException('You are not assigned to this breakout room');
      }
      return room;
    });

    await this.recordings.assertConsentAndPrepare(principal, session);

    const webinarRole =
      session.kind === SessionKind.WEBINAR
        ? await this.resolveWebinarRole(principal, sessionId)
        : null;
    const webinarCanModerate =
      webinarRole === EventPresenterRole.ORGANIZER ||
      webinarRole === EventPresenterRole.HOST ||
      webinarRole === EventPresenterRole.CO_HOST;
    const webinarCanPublish = webinarCanModerate || webinarRole === EventPresenterRole.SPEAKER;
    const canPublish =
      session.kind === SessionKind.WEBINAR
        ? webinarCanPublish || isHost
        : isHost ||
          (!principal.roles.includes('ANALYST') &&
            !principal.roles.includes('GUEST'));
    const roomAdmin = isHost || webinarCanModerate;
    const expiresIn = this.config.getOrThrow<number>('LIVEKIT_TOKEN_TTL_SECONDS');
    const accessToken = new AccessToken(
      this.config.getOrThrow<string>('LIVEKIT_API_KEY'),
      this.config.getOrThrow<string>('LIVEKIT_API_SECRET'),
      {
        identity: principal.userId,
        name: principal.displayName,
        ttl: expiresIn,
        metadata: JSON.stringify({
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          sessionId,
          breakoutRoomId,
          roles: principal.roles,
          ...(webinarRole ? { webinarRole } : {}),
        }),
      },
    );
    accessToken.addGrant({
      room: breakout.livekitRoomName,
      roomJoin: true,
      roomAdmin,
      canPublish,
      canSubscribe: true,
      canPublishData: true,
    });

    return {
      url: this.config.getOrThrow<string>('LIVEKIT_URL'),
      token: await accessToken.toJwt(),
      expiresIn,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
  }

  private async resolveWebinarRole(
    principal: Principal,
    sessionId: string,
  ): Promise<EventPresenterRole | null> {
    return this.database.run(principal, async (transaction) => {
      const event = await transaction.event.findUnique({
        where: { sessionId },
        select: { id: true },
      });
      if (!event) return null;
      const presenter = await transaction.eventPresenter.findFirst({
        where: {
          eventId: event.id,
          OR: [
            { userId: principal.userId },
            { email: principal.email.toLowerCase() },
          ],
        },
        select: { role: true },
      });
      return presenter?.role ?? null;
    });
  }
}
