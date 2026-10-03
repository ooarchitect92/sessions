import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, SessionKind, SessionStatus } from '@prisma/client';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { AuditService } from '../audit/audit.service';
import {
  HOST_ROLES,
  hasAnyRole,
  type Principal,
} from '../common/auth/principal';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { RealtimeEventsService } from '../infrastructure/realtime-events.service';
import { RedisService } from '../infrastructure/redis.service';
import { OutboxService } from '../outbox/outbox.service';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { RecordingsService } from '../recordings/recordings.service';
import { SessionsService } from '../sessions/sessions.service';

const JOINABLE_SESSION_STATUSES = new Set<SessionStatus>([
  SessionStatus.DRAFT,
  SessionStatus.SCHEDULED,
  SessionStatus.LIVE,
]);

const REJOIN_BLOCK_SECONDS = 5 * 60;

@Injectable()
export class MediaService {
  private readonly roomService: RoomServiceClient;

  constructor(
    private readonly config: ConfigService,
    private readonly database: TenantDatabaseService,
    private readonly sessions: SessionsService,
    private readonly recordings: RecordingsService,
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly redis: RedisService,
  ) {
    this.roomService = new RoomServiceClient(
      config.getOrThrow<string>('LIVEKIT_API_URL'),
      config.getOrThrow<string>('LIVEKIT_API_KEY'),
      config.getOrThrow<string>('LIVEKIT_API_SECRET'),
    );
  }

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

    if (!isHost) {
      const blocked = await this.redis.get(
        this.rejoinBlockKey(sessionId, principal.userId),
      );
      if (blocked) {
        throw new ForbiddenException(
          'A host removed you from this meeting. Rejoin is temporarily disabled.',
        );
      }
    }

    await this.recordings.assertConsentAndPrepare(principal, session);

    let stageRole: EventStageRole | null = null;
    if (session.kind === SessionKind.WEBINAR) {
      const stageProfile = await this.database.run(principal, (transaction) =>
        transaction.eventSpeaker.findFirst({
          where: {
            userId: principal.userId,
            event: { sessionId },
          },
          select: { role: true },
        }),
      );
      stageRole = stageProfile?.role ?? null;
    }

    const canModerate =
      isHost ||
      stageRole === EventStageRole.ORGANIZER ||
      stageRole === EventStageRole.HOST ||
      stageRole === EventStageRole.COHOST;
    const canPublish =
      session.kind === SessionKind.WEBINAR
        ? canModerate || stageRole === EventStageRole.SPEAKER
        : isHost ||
          (!principal.roles.includes('ANALYST') &&
            !principal.roles.includes('GUEST'));
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
          eventStageRole: stageRole,
        }),
      },
    );
    accessToken.addGrant({
      room: session.livekitRoomName,
      roomJoin: true,
      roomAdmin: canModerate,
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

  async listParticipants(principal: Principal, sessionId: string) {
    this.assertHost(principal);
    const session = await this.sessions.getById(principal, sessionId);
    const participants = await this.roomService.listParticipants(
      session.livekitRoomName,
    );
    return participants.map((participant) =>
      this.toParticipantResponse(participant),
    );
  }

  async mutePublishedTrack(
    principal: Principal,
    sessionId: string,
    participantId: string,
    trackSid: string,
    muted: boolean,
  ) {
    this.assertHost(principal);
    const session = await this.sessions.getById(principal, sessionId);
    const participant = await this.roomService.getParticipant(
      session.livekitRoomName,
      participantId,
    );
    const track = participant.tracks.find((candidate) => candidate.sid === trackSid);
    if (!track) throw new NotFoundException('Published track not found');

    const updated = await this.roomService.mutePublishedTrack(
      session.livekitRoomName,
      participantId,
      trackSid,
      muted,
    );

    await this.recordModeration(principal, {
      sessionId,
      participantId,
      action: muted ? 'media.track.muted' : 'media.track.unmuted',
      payload: { trackSid, muted },
    });
    this.publishModeration(sessionId, {
      type: 'TRACK_MUTE_CHANGED',
      participantId,
      trackSid,
      muted,
    });

    return {
      sessionId,
      participantId,
      track: {
        sid: updated.sid,
        name: updated.name,
        muted: updated.muted,
        type: updated.type,
        source: updated.source,
      },
    };
  }

  async setPublishPermission(
    principal: Principal,
    sessionId: string,
    participantId: string,
    canPublish: boolean,
  ) {
    this.assertHost(principal);
    if (participantId === principal.userId && !canPublish) {
      throw new BadRequestException(
        'Use your own meeting controls instead of revoking your host publish permission',
      );
    }

    const session = await this.sessions.getById(principal, sessionId);
    const participant = await this.roomService.getParticipant(
      session.livekitRoomName,
      participantId,
    );
    const updated = await this.roomService.updateParticipant(
      session.livekitRoomName,
      participantId,
      {
        permission: {
          ...participant.permission,
          canPublish,
        },
      },
    );

    await this.recordModeration(principal, {
      sessionId,
      participantId,
      action: 'media.participant.permission_updated',
      payload: { canPublish },
    });
    this.publishModeration(sessionId, {
      type: 'PUBLISH_PERMISSION_CHANGED',
      participantId,
      canPublish,
    });

    return this.toParticipantResponse(updated);
  }

  async removeParticipant(
    principal: Principal,
    sessionId: string,
    participantId: string,
  ): Promise<{ sessionId: string; participantId: string; rejoinBlockedUntil: string }> {
    this.assertHost(principal);
    if (participantId === principal.userId) {
      throw new BadRequestException('A host cannot remove themselves');
    }

    const session = await this.sessions.getById(principal, sessionId);
    await this.roomService.getParticipant(session.livekitRoomName, participantId);
    await this.roomService.removeParticipant(
      session.livekitRoomName,
      participantId,
    );

    const rejoinBlockedUntil = new Date(
      Date.now() + REJOIN_BLOCK_SECONDS * 1000,
    ).toISOString();
    await this.redis.set(
      this.rejoinBlockKey(sessionId, participantId),
      rejoinBlockedUntil,
      'EX',
      REJOIN_BLOCK_SECONDS,
    );

    await this.recordModeration(principal, {
      sessionId,
      participantId,
      action: 'media.participant.removed',
      payload: { rejoinBlockedUntil },
    });
    this.publishModeration(sessionId, {
      type: 'PARTICIPANT_REMOVED',
      participantId,
      rejoinBlockedUntil,
    });

    return { sessionId, participantId, rejoinBlockedUntil };
  }

  async allowRejoin(
    principal: Principal,
    sessionId: string,
    participantId: string,
  ): Promise<{ sessionId: string; participantId: string; rejoinAllowed: true }> {
    this.assertHost(principal);
    await this.sessions.getById(principal, sessionId);
    await this.redis.del(this.rejoinBlockKey(sessionId, participantId));

    await this.recordModeration(principal, {
      sessionId,
      participantId,
      action: 'media.participant.rejoin_allowed',
      payload: {},
    });
    this.publishModeration(sessionId, {
      type: 'REJOIN_ALLOWED',
      participantId,
    });

    return { sessionId, participantId, rejoinAllowed: true };
  }

  private async recordModeration(
    principal: Principal,
    input: {
      sessionId: string;
      participantId: string;
      action: string;
      payload: Prisma.JsonObject;
    },
  ): Promise<void> {
    await this.database.run(principal, async (transaction) => {
      await this.audit.record(transaction, principal, {
        action: input.action,
        resourceType: 'session',
        resourceId: input.sessionId,
        metadata: {
          participantId: input.participantId,
          ...input.payload,
        },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'session',
        aggregateId: input.sessionId,
        eventType: input.action,
        payload: {
          sessionId: input.sessionId,
          participantId: input.participantId,
          ...input.payload,
        },
      });
    });
  }

  private publishModeration(
    sessionId: string,
    payload: Prisma.JsonObject,
  ): void {
    this.realtimeEvents.publishSessionEvent({
      sessionId,
      eventName: 'media.moderation.updated',
      payload: {
        sessionId,
        ...payload,
      },
    });
  }

  private toParticipantResponse(participant: {
    identity: string;
    name: string;
    joinedAt?: bigint;
    permission?: {
      canPublish?: boolean;
      canSubscribe?: boolean;
      canPublishData?: boolean;
    };
    tracks: Array<{
      sid: string;
      name: string;
      muted: boolean;
      type: number;
      source: number;
    }>;
  }) {
    return {
      identity: participant.identity,
      name: participant.name,
      permission: {
        canPublish: participant.permission?.canPublish ?? false,
        canSubscribe: participant.permission?.canSubscribe ?? false,
        canPublishData: participant.permission?.canPublishData ?? false,
      },
      tracks: participant.tracks.map((track) => ({
        sid: track.sid,
        name: track.name,
        muted: track.muted,
        type: track.type,
        source: track.source,
        kind: track.type === 0 ? 'audio' : 'video',
      })),
    };
  }

  private assertHost(principal: Principal): void {
    if (!hasAnyRole(principal, HOST_ROLES)) {
      throw new ForbiddenException('A host role is required');
    }
  }

  private rejoinBlockKey(sessionId: string, userId: string): string {
    return `media:v1:session:${sessionId}:rejoin-block:${userId}`;
  }
}
