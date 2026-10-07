import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SessionStatus } from '@prisma/client';
import type { Principal } from '../common/auth/principal';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { RealtimeEventsService } from '../infrastructure/realtime-events.service';
import { OutboxService } from '../outbox/outbox.service';
import { HttpTranscriptionProvider } from './http-transcription.provider';
import { SubmitLiveTranscriptionChunkDto } from './dto/submit-live-transcription-chunk.dto';

const MAX_LIVE_CHUNK_BYTES = 2 * 1024 * 1024;

@Injectable()
export class LiveTranscriptionService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly provider: HttpTranscriptionProvider,
    private readonly outbox: OutboxService,
    private readonly realtime: RealtimeEventsService,
  ) {}

  async submitChunk(
    principal: Principal,
    sessionId: string,
    input: SubmitLiveTranscriptionChunkDto,
  ) {
    const context = await this.database.run(principal, async (transaction) => {
      const session = await transaction.session.findUnique({
        where: { id: sessionId },
        select: {
          id: true,
          status: true,
          transcriptionEnabled: true,
          organizationId: true,
          workspaceId: true,
        },
      });
      if (!session) throw new NotFoundException('Session not found');
      if (!session.transcriptionEnabled) {
        throw new ConflictException('Transcription is not enabled for this session');
      }
      if (session.status !== SessionStatus.LIVE) {
        throw new ConflictException('Live captions are only available while the session is live');
      }
      return session;
    });

    const audio = Buffer.from(input.audioBase64, 'base64');
    if (audio.length === 0) {
      throw new BadRequestException('Audio chunk is empty');
    }
    if (audio.length > MAX_LIVE_CHUNK_BYTES) {
      throw new BadRequestException('Audio chunk exceeds the 2 MB live-caption limit');
    }

    const result = await this.provider.transcribe({
      audio,
      filename: `session-${sessionId}-chunk-${input.sequence}.webm`,
      mimeType: input.mimeType,
      ...(input.language ? { language: input.language } : {}),
    });

    const persisted = await this.database.run(principal, async (transaction) => {
      const lockKey = `live-transcript:${sessionId}`;
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;

      const transcript = await transaction.transcript.upsert({
        where: { sessionId },
        update: {
          provider: result.provider,
          ...(result.language ? { language: result.language } : {}),
        },
        create: {
          organizationId: context.organizationId,
          workspaceId: context.workspaceId,
          sessionId,
          provider: result.provider,
          ...(result.language ? { language: result.language } : {}),
        },
      });

      const last = await transaction.transcriptSegment.findFirst({
        where: { transcriptId: transcript.id },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      const firstPosition = (last?.position ?? -1) + 1;

      const segments = [];
      for (const [offset, segment] of result.segments.entries()) {
        const created = await transaction.transcriptSegment.create({
          data: {
            organizationId: context.organizationId,
            workspaceId: context.workspaceId,
            transcriptId: transcript.id,
            position: firstPosition + offset,
            startMs: input.startMs + segment.startMs,
            endMs: input.startMs + segment.endMs,
            speakerLabel: segment.speakerLabel || principal.displayName,
            text: segment.text,
          },
        });
        segments.push(created);
      }

      const currentText = transcript.fullText?.trim() ?? '';
      const appendedText = result.text.trim();
      await transaction.transcript.update({
        where: { id: transcript.id },
        data: {
          fullText: [currentText, appendedText].filter(Boolean).join(' '),
          provider: result.provider,
          ...(result.language ? { language: result.language } : {}),
          version: { increment: 1 },
        },
      });

      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'transcript',
        aggregateId: transcript.id,
        eventType: 'transcript.live.chunk',
        payload: {
          transcriptId: transcript.id,
          sessionId,
          sequence: input.sequence,
          segmentCount: segments.length,
          userId: principal.userId,
        },
      });

      return {
        transcriptId: transcript.id,
        provider: result.provider,
        language: result.language ?? transcript.language,
        segments,
      };
    });

    for (const segment of persisted.segments) {
      this.realtime.publishSessionEvent({
        sessionId,
        eventName: 'transcript.live.segment',
        payload: {
          transcriptId: persisted.transcriptId,
          sessionId,
          segmentId: segment.id,
          position: segment.position,
          startMs: segment.startMs,
          endMs: segment.endMs,
          speakerLabel: segment.speakerLabel,
          text: segment.text,
          userId: principal.userId,
          displayName: principal.displayName,
          language: persisted.language,
          isFinal: true,
        },
      });
    }

    return {
      sessionId,
      transcriptId: persisted.transcriptId,
      provider: persisted.provider,
      language: persisted.language,
      segmentCount: persisted.segments.length,
      segments: persisted.segments.map((segment) => ({
        id: segment.id,
        position: segment.position,
        startMs: segment.startMs,
        endMs: segment.endMs,
        speakerLabel: segment.speakerLabel,
        text: segment.text,
      })),
    };
  }
}
