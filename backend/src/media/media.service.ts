import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SessionKind, SessionStatus } from '@prisma/client';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import {
  HOST_ROLES,
  hasAnyRole,
  type Principal,
} from '../common/auth/principal';
import { AuditService } from '../audit/audit.service';
import { BreakoutsService } from '../breakouts/breakouts.service';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { EventsService } from '../events/events.service';
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
    private readonly breakouts: BreakoutsService,
    private readonly events: EventsService,
    private readonly audit: AuditService,
    private readonly database: TenantDatabaseService,
  ) {}


  async listParticipants(
    principal: Principal,
    sessionId: string,
    breakoutRoomId?: string,
  ) {
    const roomName = await this.resolveRoomName(
      principal,
      sessionId,
      breakoutRoomId,
    );
    const participants = await this.listRoomParticipants(roomName);

    return {
      sessionId,
      roomName,
      breakoutRoomId: breakoutRoomId ?? null,
      participants: participants.map((participant) => {
        const context = this.parseParticipantMetadata(participant.metadata);
        return {
          identity: participant.identity,
          name: participant.name || 'Participant',
          state: this.participantState(Number(participant.state)),
          joinedAt:
            Number(participant.joinedAt) > 0
              ? new Date(Number(participant.joinedAt) * 1000).toISOString()
              : null,
          isPublisher: participant.isPublisher,
          canPublish: participant.permission?.canPublish ?? false,
          roles: context.roles,
          presenterRole: context.presenterRole,
          tracks: participant.tracks.map((track) => ({
            sid: track.sid,
            name: track.name || null,
            muted: track.muted,
            kind: this.trackKind(Number(track.type)),
            source: this.trackSource(Number(track.source)),
          })),
        };
      }),
    };
  }

  async setTrackMuted(
    principal: Principal,
    sessionId: string,
    participantIdentity: string,
    trackSid: string,
    muted: boolean,
    breakoutRoomId?: string,
  ) {
    this.assertHost(principal);
    const roomName = await this.resolveRoomName(
      principal,
      sessionId,
      breakoutRoomId,
    );
    const participants = await this.listRoomParticipants(roomName);
    const participant = participants.find(
      (candidate) => candidate.identity === participantIdentity,
    );
    if (!participant) throw new NotFoundException('Participant is not connected');
    const track = participant.tracks.find((candidate) => candidate.sid === trackSid);
    if (!track) throw new NotFoundException('Published track was not found');

    try {
      await this.roomService().mutePublishedTrack(
        roomName,
        participantIdentity,
        trackSid,
        muted,
      );
    } catch {
      throw new ServiceUnavailableException(
        'Unable to update participant media right now',
      );
    }

    await this.database.run(principal, (transaction) =>
      this.audit.record(transaction, principal, {
        action: muted ? 'media.participant.track_muted' : 'media.participant.track_unmuted',
        resourceType: 'session',
        resourceId: sessionId,
        metadata: {
          participantIdentity,
          trackSid,
          trackKind: this.trackKind(Number(track.type)),
          trackSource: this.trackSource(Number(track.source)),
          breakoutRoomId: breakoutRoomId ?? null,
        },
      }),
    );

    return {
      sessionId,
      participantIdentity,
      trackSid,
      muted,
      breakoutRoomId: breakoutRoomId ?? null,
    };
  }

  async removeParticipant(
    principal: Principal,
    sessionId: string,
    participantIdentity: string,
    breakoutRoomId?: string,
  ) {
    this.assertHost(principal);
    if (participantIdentity === principal.userId) {
      throw new ConflictException(
        'Use the leave control to remove yourself from the meeting',
      );
    }

    const roomName = await this.resolveRoomName(
      principal,
      sessionId,
      breakoutRoomId,
    );
    const participants = await this.listRoomParticipants(roomName);
    const participant = participants.find(
      (candidate) => candidate.identity === participantIdentity,
    );
    if (!participant) throw new NotFoundException('Participant is not connected');

    try {
      await this.roomService().removeParticipant(roomName, participantIdentity, {
        revokeTokenTs: BigInt(Math.floor(Date.now() / 1000)),
      });
    } catch {
      throw new ServiceUnavailableException(
        'Unable to remove the participant right now',
      );
    }

    await this.database.run(principal, (transaction) =>
      this.audit.record(transaction, principal, {
        action: 'media.participant.removed',
        resourceType: 'session',
        resourceId: sessionId,
        metadata: {
          participantIdentity,
          breakoutRoomId: breakoutRoomId ?? null,
        },
      }),
    );

    return {
      sessionId,
      participantIdentity,
      removed: true as const,
      breakoutRoomId: breakoutRoomId ?? null,
    };
  }

  private async resolveRoomName(
    principal: Principal,
    sessionId: string,
    breakoutRoomId?: string,
  ): Promise<string> {
    const session = await this.sessions.getById(principal, sessionId);
    if (!breakoutRoomId) return session.livekitRoomName;
    const breakout = await this.breakouts.resolveMediaRoom(
      principal,
      sessionId,
      breakoutRoomId,
    );
    return breakout.livekitRoomName;
  }

  private async listRoomParticipants(roomName: string) {
    try {
      const service = this.roomService();
      const rooms = await service.listRooms([roomName]);
      if (rooms.length === 0) return [];
      return await service.listParticipants(roomName);
    } catch {
      throw new ServiceUnavailableException(
        'Live participant state is temporarily unavailable',
      );
    }
  }

  private roomService(): RoomServiceClient {
    const rawUrl = this.config.getOrThrow<string>('LIVEKIT_URL');
    const serviceUrl = new URL(rawUrl);
    if (serviceUrl.protocol === 'ws:') serviceUrl.protocol = 'http:';
    if (serviceUrl.protocol === 'wss:') serviceUrl.protocol = 'https:';
    return new RoomServiceClient(
      serviceUrl.toString().replace(/\/$/, ''),
      this.config.getOrThrow<string>('LIVEKIT_API_KEY'),
      this.config.getOrThrow<string>('LIVEKIT_API_SECRET'),
    );
  }

  private assertHost(principal: Principal): void {
    if (!hasAnyRole(principal, HOST_ROLES)) {
      throw new ForbiddenException('A host role is required for media moderation');
    }
  }

  private parseParticipantMetadata(metadata: string): {
    roles: string[];
    presenterRole: string | null;
  } {
    try {
      const parsed = JSON.parse(metadata) as {
        roles?: unknown;
        presenterRole?: unknown;
      };
      return {
        roles: Array.isArray(parsed.roles)
          ? parsed.roles.filter((role): role is string => typeof role === 'string')
          : [],
        presenterRole:
          typeof parsed.presenterRole === 'string' ? parsed.presenterRole : null,
      };
    } catch {
      return { roles: [], presenterRole: null };
    }
  }

  private participantState(value: number): 'joining' | 'joined' | 'active' | 'disconnected' | 'unknown' {
    if (value === 0) return 'joining';
    if (value === 1) return 'joined';
    if (value === 2) return 'active';
    if (value === 3) return 'disconnected';
    return 'unknown';
  }

  private trackKind(value: number): 'audio' | 'video' | 'data' | 'unknown' {
    if (value === 0) return 'audio';
    if (value === 1) return 'video';
    if (value === 2) return 'data';
    return 'unknown';
  }

  private trackSource(
    value: number,
  ): 'unknown' | 'camera' | 'microphone' | 'screen-share' | 'screen-share-audio' {
    if (value === 1) return 'camera';
    if (value === 2) return 'microphone';
    if (value === 3) return 'screen-share';
    if (value === 4) return 'screen-share-audio';
    return 'unknown';
  }

  async createJoinToken(
    principal: Principal,
    sessionId: string,
    breakoutRoomId?: string,
  ): Promise<{ url: string; token: string; expiresIn: number; expiresAt: string; roomName: string; breakoutRoomId: string | null }> {
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

    const breakout = breakoutRoomId
      ? await this.breakouts.resolveMediaRoom(principal, sessionId, breakoutRoomId)
      : null;
    const targetRoomName = breakout?.livekitRoomName ?? session.livekitRoomName;

    const webinarPermissions =
      session.kind === SessionKind.WEBINAR
        ? await this.events.getWebinarMediaPermissions(principal, sessionId)
        : null;
    const canPublish =
      webinarPermissions?.applies === true
        ? webinarPermissions.canPublish
        : isHost ||
          (session.kind === SessionKind.MEETING &&
            !principal.roles.includes('ANALYST') &&
            !principal.roles.includes('GUEST'));
    const roomAdmin =
      webinarPermissions?.applies === true
        ? webinarPermissions.roomAdmin
        : isHost;
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
          breakoutRoomId: breakout?.id ?? null,
          roles: principal.roles,
          presenterRole: webinarPermissions?.presenterRole ?? null,
        }),
      },
    );
    accessToken.addGrant({
      room: targetRoomName,
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
      roomName: targetRoomName,
      breakoutRoomId: breakout?.id ?? null,
    };
  }
}
