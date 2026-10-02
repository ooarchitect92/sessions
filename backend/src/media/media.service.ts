import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SessionKind, SessionStatus } from '@prisma/client';
import { AccessToken } from 'livekit-server-sdk';
import {
  HOST_ROLES,
  hasAnyRole,
  type Principal,
} from '../common/auth/principal';
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

    const canPublish =
      isHost ||
      (session.kind === SessionKind.MEETING &&
        !principal.roles.includes('ANALYST') &&
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
        }),
      },
    );
    accessToken.addGrant({
      room: session.livekitRoomName,
      roomJoin: true,
      roomAdmin: isHost,
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
}
