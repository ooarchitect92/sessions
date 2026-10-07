import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BreakoutRoomStatus,
  EventPresenterRole,
  EventStatus,
  RegistrationStatus,
  SessionKind,
  SessionStatus,
} from '@prisma/client';
import { AccessToken } from 'livekit-server-sdk';
import {
  HOST_ROLES,
  hasAnyRole,
  type Principal,
} from '../common/auth/principal';
import { SecurityService } from '../auth/security.service';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { WorkerPrismaService } from '../database/worker-prisma.service';
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
    private readonly publicDatabase: WorkerPrismaService,
    private readonly security: SecurityService,
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

  async createPublicWebinarJoinToken(
    organizationSlug: string,
    workspaceSlug: string,
    eventSlug: string,
    registrationId: string,
    admissionToken: string,
  ): Promise<{
    url: string;
    token: string;
    expiresIn: number;
    expiresAt: string;
    sessionId: string;
    event: { id: string; title: string; startsAt: string; timezone: string };
  }> {
    const event = await this.publicDatabase.event.findFirst({
      where: {
        slug: eventSlug,
        status: { in: [EventStatus.PUBLISHED, EventStatus.LIVE] },
        workspace: {
          slug: workspaceSlug,
          organization: { slug: organizationSlug },
        },
      },
      include: {
        session: true,
      },
    });
    if (!event?.session || event.session.kind !== SessionKind.WEBINAR) {
      throw new ForbiddenException('Webinar admission is unavailable');
    }
    if (
      event.session.status !== SessionStatus.SCHEDULED &&
      event.session.status !== SessionStatus.LIVE
    ) {
      throw new ConflictException('This webinar is not joinable');
    }

    const registration = await this.publicDatabase.eventRegistration.findFirst({
      where: {
        id: registrationId,
        eventId: event.id,
        status: { in: [RegistrationStatus.REGISTERED, RegistrationStatus.ATTENDED] },
      },
    });
    if (
      !registration?.admissionTokenHash ||
      !registration.admissionTokenExpiresAt ||
      registration.admissionTokenExpiresAt <= new Date()
    ) {
      throw new ForbiddenException('The webinar admission link is invalid or expired');
    }

    const parsed = this.security.parseOpaqueToken(admissionToken);
    if (
      !parsed ||
      parsed.id !== registration.id ||
      !this.security.verifyTokenDigest(parsed.secret, registration.admissionTokenHash)
    ) {
      throw new ForbiddenException('The webinar admission link is invalid or expired');
    }

    const now = Date.now();
    const opensAt = event.startsAt.getTime() - 30 * 60_000;
    const closesAt =
      event.startsAt.getTime() + (event.durationMinutes + 60) * 60_000;
    if (now < opensAt) {
      throw new ConflictException('Webinar admission opens 30 minutes before the event');
    }
    if (now > closesAt) {
      throw new ConflictException('Webinar admission has closed');
    }

    if (!registration.checkedInAt || registration.status !== RegistrationStatus.ATTENDED) {
      await this.publicDatabase.eventRegistration.update({
        where: { id: registration.id },
        data: {
          status: RegistrationStatus.ATTENDED,
          checkedInAt: registration.checkedInAt ?? new Date(),
        },
      });
    }

    const expiresIn = this.config.getOrThrow<number>('LIVEKIT_TOKEN_TTL_SECONDS');
    const accessToken = new AccessToken(
      this.config.getOrThrow<string>('LIVEKIT_API_KEY'),
      this.config.getOrThrow<string>('LIVEKIT_API_SECRET'),
      {
        identity: `attendee:${registration.id}`,
        name: registration.name,
        ttl: expiresIn,
        metadata: JSON.stringify({
          organizationId: event.organizationId,
          workspaceId: event.workspaceId,
          sessionId: event.session.id,
          eventId: event.id,
          registrationId: registration.id,
          webinarRole: 'ATTENDEE',
        }),
      },
    );
    accessToken.addGrant({
      room: event.session.livekitRoomName,
      roomJoin: true,
      roomAdmin: false,
      canPublish: false,
      canSubscribe: true,
      canPublishData: true,
    });

    return {
      url: this.config.getOrThrow<string>('LIVEKIT_URL'),
      token: await accessToken.toJwt(),
      expiresIn,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      sessionId: event.session.id,
      event: {
        id: event.id,
        title: event.title,
        startsAt: event.startsAt.toISOString(),
        timezone: event.timezone,
      },
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
