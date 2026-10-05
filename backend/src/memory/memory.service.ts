import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ArtifactStatus,
  Prisma,
  SessionStatus,
  type Session,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { HOST_ROLES, hasAnyRole, type Principal } from '../common/auth/principal';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { RealtimeEventsService } from '../infrastructure/realtime-events.service';
import { OutboxService } from '../outbox/outbox.service';
import { ListMemoryQuery } from './dto/list-memory.query';
import { UpdateTranscriptSegmentDto } from './dto/update-transcript-segment.dto';

@Injectable()
export class MemoryService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly realtime: RealtimeEventsService,
  ) {}

  async list(principal: Principal, query: ListMemoryQuery) {
    return this.database.run(principal, async (transaction) => {
      const transcriptSessionIds = query.query
        ? await transaction.$queryRaw<Array<{ session_id: string }>>(Prisma.sql`
            SELECT session_id
            FROM transcripts
            WHERE to_tsvector('simple', coalesce(full_text, ''))
              @@ websearch_to_tsquery('simple', ${query.query})
          `)
        : [];
      const where: Prisma.SessionWhereInput = {
        OR: [
          {
            status: {
              in: [
                SessionStatus.ENDED,
                SessionStatus.PROCESSING,
                SessionStatus.READY,
                SessionStatus.FAILED,
              ],
            },
          },
          { recording: { isNot: null } },
          { transcript: { isNot: null } },
          { memorySummary: { isNot: null } },
        ],
        ...(query.query
          ? {
              AND: [
                {
                  OR: [
                    { title: { contains: query.query, mode: 'insensitive' } },
                    {
                      description: {
                        contains: query.query,
                        mode: 'insensitive',
                      },
                    },
                    ...(transcriptSessionIds.length
                      ? [
                          {
                            id: {
                              in: transcriptSessionIds.map(
                                (item) => item.session_id,
                              ),
                            },
                          },
                        ]
                      : []),
                  ],
                },
              ],
            }
          : {}),
      };
      const [items, total] = await Promise.all([
        transaction.session.findMany({
          where,
          include: {
            recording: true,
            transcript: {
              select: {
                id: true,
                status: true,
                language: true,
                completedAt: true,
              },
            },
            memorySummary: true,
            _count: {
              select: { chatMessages: true, polls: true, questions: true },
            },
          },
          orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        transaction.session.count({ where }),
      ]);
      return { items, page: query.page, pageSize: query.pageSize, total };
    });
  }

  async getBySession(principal: Principal, sessionId: string) {
    return this.database.run(principal, async (transaction) => {
      const session = await transaction.session.findUnique({
        where: { id: sessionId },
        include: {
          agendaItems: { orderBy: { position: 'asc' } },
          recording: true,
          transcript: {
            include: {
              segments: { orderBy: { position: 'asc' } },
              revisions: { orderBy: { createdAt: 'desc' }, take: 50 },
            },
          },
          memorySummary: true,
          chatMessages: {
            where: { deletedAt: null },
            include: { author: { select: { displayName: true } } },
            orderBy: { createdAt: 'asc' },
          },
          polls: {
            include: {
              options: { orderBy: { position: 'asc' } },
              _count: { select: { answers: true } },
            },
            orderBy: { createdAt: 'asc' },
          },
          questions: {
            where: { status: { in: ['APPROVED', 'ANSWERED'] } },
            include: { _count: { select: { votes: true } } },
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      if (!session) throw new NotFoundException('Session memory not found');
      return session;
    });
  }

  async getRecording(principal: Principal, sessionId: string) {
    return this.database.run(principal, async (transaction) => {
      const recording = await transaction.recording.findUnique({
        where: { sessionId },
      });
      if (!recording) throw new NotFoundException('Recording not found');
      return recording;
    });
  }

  async getTranscript(principal: Principal, sessionId: string) {
    return this.database.run(principal, async (transaction) => {
      const transcript = await transaction.transcript.findUnique({
        where: { sessionId },
        include: {
          segments: { orderBy: { position: 'asc' } },
          revisions: { orderBy: { createdAt: 'desc' }, take: 100 },
        },
      });
      if (!transcript) throw new NotFoundException('Transcript not found');
      return transcript;
    });
  }

  async updateTranscriptSegment(
    principal: Principal,
    sessionId: string,
    segmentId: string,
    expectedVersion: number,
    body: UpdateTranscriptSegmentDto,
  ) {
    this.assertHost(principal);
    const result = await this.database.run(principal, async (transaction) => {
      const transcript = await transaction.transcript.findUnique({
        where: { sessionId },
        include: { segments: { orderBy: { position: 'asc' } } },
      });
      if (!transcript) throw new NotFoundException('Transcript not found');
      if (transcript.status !== ArtifactStatus.READY) {
        throw new ConflictException('Only ready transcripts can be corrected');
      }
      if (transcript.version !== expectedVersion) {
        throw new ConflictException(
          `Transcript version mismatch. Current version is ${transcript.version}`,
        );
      }

      const segment = transcript.segments.find((item) => item.id === segmentId);
      if (!segment) throw new NotFoundException('Transcript segment not found');

      const nextSpeakerLabel = body.speakerLabel?.trim() || null;
      const nextText = body.text.trim();
      const before = {
        text: segment.text,
        speakerLabel: segment.speakerLabel,
      };
      const after = {
        text: nextText,
        speakerLabel: nextSpeakerLabel,
      };

      if (
        before.text === after.text &&
        before.speakerLabel === after.speakerLabel
      ) {
        return transcript;
      }

      await transaction.transcriptSegment.update({
        where: { id: segment.id },
        data: {
          text: nextText,
          speakerLabel: nextSpeakerLabel,
        },
      });

      const fullText = transcript.segments
        .map((item) => (item.id === segment.id ? nextText : item.text))
        .join(' ')
        .trim();

      await transaction.transcriptRevision.create({
        data: {
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          transcriptId: transcript.id,
          segmentId: segment.id,
          editedByUserId: principal.userId,
          before,
          after,
        },
      });

      const updated = await transaction.transcript.update({
        where: { id: transcript.id },
        data: {
          fullText,
          version: { increment: 1 },
        },
        include: {
          segments: { orderBy: { position: 'asc' } },
          revisions: { orderBy: { createdAt: 'desc' }, take: 100 },
        },
      });

      await this.audit.record(transaction, principal, {
        action: 'transcript.segment_corrected',
        resourceType: 'transcript',
        resourceId: transcript.id,
        metadata: {
          sessionId,
          segmentId,
          previousVersion: transcript.version,
          version: updated.version,
        },
      });

      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'transcript',
        aggregateId: transcript.id,
        eventType: 'transcript.corrected',
        payload: {
          transcriptId: transcript.id,
          sessionId,
          segmentId,
          version: updated.version,
        },
      });

      return updated;
    });

    this.realtime.publishSessionEvent({
      sessionId,
      eventName: 'transcript.corrected',
      payload: {
        transcriptId: result.id,
        segmentId,
        version: result.version,
      },
    });
    return result;
  }

  async retryFailed(principal: Principal, sessionId: string) {
    this.assertHost(principal);
    const result = await this.database.run(principal, async (transaction) => {
      const session = await transaction.session.findUnique({
        where: { id: sessionId },
      });
      if (!session) throw new NotFoundException('Session not found');
      const recording = await transaction.recording.findUnique({
        where: { sessionId },
      });
      const transcript = await transaction.transcript.findUnique({
        where: { sessionId },
      });
      const summary = await transaction.memorySummary.findUnique({
        where: { sessionId },
      });
      const retried: string[] = [];
      const skipped: Array<{ artifact: string; reason: string }> = [];

      if (recording?.status === ArtifactStatus.FAILED) {
        if (recording.providerJobId) {
          await transaction.recording.update({
            where: { id: recording.id },
            data: {
              status: ArtifactStatus.PROCESSING,
              failureCode: null,
              completedAt: null,
              version: { increment: 1 },
            },
          });
          retried.push('recording-reconciliation');
        } else if (session.status === SessionStatus.LIVE) {
          await transaction.recording.update({
            where: { id: recording.id },
            data: {
              status: ArtifactStatus.PENDING,
              provider: null,
              providerJobId: null,
              objectKey: null,
              playbackObjectKey: null,
              mimeType: null,
              sizeBytes: null,
              durationSeconds: null,
              startedAt: null,
              completedAt: null,
              stopRequestedAt: null,
              deletionRequestedAt: null,
              deletedAt: null,
              failureCode: null,
              version: { increment: 1 },
            },
          });
          await this.outbox.enqueue(transaction, principal, {
            aggregateType: 'recording',
            aggregateId: recording.id,
            eventType: 'recording.start.requested',
            payload: { recordingId: recording.id, sessionId },
          });
          retried.push('recording');
        } else {
          skipped.push({
            artifact: 'recording',
            reason: 'live_media_is_no_longer_available',
          });
        }
      }
      if (transcript?.status === ArtifactStatus.FAILED) {
        await transaction.transcript.update({
          where: { id: transcript.id },
          data: {
            status: ArtifactStatus.PENDING,
            failureCode: null,
            version: { increment: 1 },
          },
        });
        await this.outbox.enqueue(transaction, principal, {
          aggregateType: 'transcript',
          aggregateId: transcript.id,
          eventType: 'transcript.requested',
          payload: { transcriptId: transcript.id, sessionId },
        });
        retried.push('transcript');
      }
      if (summary?.status === ArtifactStatus.FAILED) {
        await transaction.memorySummary.update({
          where: { id: summary.id },
          data: {
            status: ArtifactStatus.PENDING,
            failureCode: null,
            version: { increment: 1 },
          },
        });
        await this.outbox.enqueue(transaction, principal, {
          aggregateType: 'memory_summary',
          aggregateId: summary.id,
          eventType: 'memory.summary.requested',
          payload: { memorySummaryId: summary.id, sessionId },
        });
        retried.push('summary');
      }
      await this.audit.record(transaction, principal, {
        action: 'memory.retry_requested',
        resourceType: 'session',
        resourceId: sessionId,
        metadata: { retried, skipped },
      });
      return { sessionId, retried, skipped };
    });
    this.realtime.publishSessionEvent({
      sessionId,
      eventName: 'memory.updated',
      payload: result,
    });
    return result;
  }

  async ensureArtifactsForEndedSession(
    transaction: Prisma.TransactionClient,
    principal: Principal,
    session: Session,
  ): Promise<void> {
    let recordingId: string | undefined;
    if (session.recordingEnabled) {
      const recording = await transaction.recording.upsert({
        where: { sessionId: session.id },
        update: {},
        create: {
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          sessionId: session.id,
          consentSnapshot: {
            required: true,
            capturedBy: 'meeting_runtime',
            requestedAt: new Date().toISOString(),
          },
        },
      });
      recordingId = recording.id;
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'recording',
        aggregateId: recording.id,
        eventType: 'recording.requested',
        payload: { recordingId: recording.id, sessionId: session.id },
      });
    }

    if (session.transcriptionEnabled) {
      const transcript = await transaction.transcript.upsert({
        where: { sessionId: session.id },
        update: {},
        create: {
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          sessionId: session.id,
          ...(recordingId ? { recordingId } : {}),
        },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'transcript',
        aggregateId: transcript.id,
        eventType: 'transcript.requested',
        payload: {
          transcriptId: transcript.id,
          sessionId: session.id,
          recordingId,
        },
      });

      const summary = await transaction.memorySummary.upsert({
        where: { sessionId: session.id },
        update: {},
        create: {
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          sessionId: session.id,
        },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'memory_summary',
        aggregateId: summary.id,
        eventType: 'memory.summary.requested',
        payload: { memorySummaryId: summary.id, sessionId: session.id },
      });
    }
  }

  private assertHost(principal: Principal): void {
    if (!hasAnyRole(principal, HOST_ROLES)) {
      throw new ForbiddenException('A host role is required');
    }
  }
}
