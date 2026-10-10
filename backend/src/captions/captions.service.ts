import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SessionStatus } from '@prisma/client';
import {
  HOST_ROLES,
  hasAnyRole,
  type Principal,
} from '../common/auth/principal';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { RealtimeEventsService } from '../infrastructure/realtime-events.service';
import { PublishCaptionDto } from './dto/publish-caption.dto';

export interface LiveCaptionPayload {
  sessionId: string;
  sequence: number;
  text: string;
  isFinal: boolean;
  startMs: number | null;
  endMs: number | null;
  speakerLabel: string | null;
  language: string | null;
  source: string;
  occurredAt: string;
}

@Injectable()
export class CaptionsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly realtime: RealtimeEventsService,
  ) {}

  async list(principal: Principal, sessionId: string) {
    return this.database.run(principal, async (transaction) => {
      const session = await transaction.session.findUnique({
        where: { id: sessionId },
        select: { id: true },
      });
      if (!session) throw new NotFoundException('Session not found');
      return transaction.liveCaptionSegment.findMany({
        where: { sessionId },
        orderBy: { sequence: 'desc' },
        take: 100,
      }).then((items) => items.reverse());
    });
  }

  async publish(
    principal: Principal,
    sessionId: string,
    input: PublishCaptionDto,
  ): Promise<LiveCaptionPayload> {
    if (!hasAnyRole(principal, HOST_ROLES)) {
      throw new ForbiddenException('Host permissions are required to publish captions');
    }
    if (
      input.startMs !== undefined &&
      input.endMs !== undefined &&
      input.endMs < input.startMs
    ) {
      throw new BadRequestException('Caption end time cannot be before start time');
    }

    const payload = await this.database.run(principal, async (transaction) => {
      const session = await transaction.session.findUnique({
        where: { id: sessionId },
        select: {
          id: true,
          status: true,
          transcriptionEnabled: true,
        },
      });
      if (!session) throw new NotFoundException('Session not found');
      if (!session.transcriptionEnabled) {
        throw new BadRequestException('Transcription is disabled for this session');
      }
      if (session.status !== SessionStatus.LIVE) {
        throw new BadRequestException('Live captions can only be published during a live session');
      }

      const value: LiveCaptionPayload = {
        sessionId,
        sequence: input.sequence,
        text: input.text.trim(),
        isFinal: input.isFinal,
        startMs: input.startMs ?? null,
        endMs: input.endMs ?? null,
        speakerLabel: input.speakerLabel?.trim() || null,
        language: input.language?.trim() || null,
        source: input.source?.trim() || 'host_bridge',
        occurredAt: new Date().toISOString(),
      };

      if (value.isFinal) {
        await transaction.liveCaptionSegment.upsert({
          where: {
            sessionId_sequence: {
              sessionId,
              sequence: value.sequence,
            },
          },
          create: {
            organizationId: principal.organizationId,
            workspaceId: principal.workspaceId,
            sessionId,
            sequence: value.sequence,
            startMs: value.startMs,
            endMs: value.endMs,
            speakerLabel: value.speakerLabel,
            language: value.language,
            text: value.text,
            source: value.source,
          },
          update: {
            startMs: value.startMs,
            endMs: value.endMs,
            speakerLabel: value.speakerLabel,
            language: value.language,
            text: value.text,
            source: value.source,
          },
        });
      }

      return value;
    });

    this.realtime.publishSessionEvent({
      sessionId,
      eventName: 'caption.segment',
      payload,
    });
    return payload;
  }
}
