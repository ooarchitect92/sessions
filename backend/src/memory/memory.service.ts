import {
  BadRequestException,
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
import { UpdateMemorySummaryDto } from './dto/update-memory-summary.dto';
import { UpdateTranscriptDto } from './dto/update-transcript.dto';

interface MemorySearchHit {
  id: string;
  rank: number;
  excerpt: string | null;
  totalCount: number;
}

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
      const searchTerm = query.query?.trim();
      if (searchTerm) {
        return this.searchMemory(
          transaction,
          principal,
          searchTerm,
          query.page,
          query.pageSize,
        );
      }

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
                version: true,
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
            include: { segments: { orderBy: { position: 'asc' } } },
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
        include: { segments: { orderBy: { position: 'asc' } } },
      });
      if (!transcript) throw new NotFoundException('Transcript not found');
      return transcript;
    });
  }


  async listTranscriptRevisions(principal: Principal, sessionId: string) {
    this.assertHost(principal);
    return this.database.run(principal, async (transaction) => {
      const transcript = await transaction.transcript.findUnique({
        where: { sessionId },
        select: { id: true },
      });
      if (!transcript) throw new NotFoundException('Transcript not found');
      return transaction.transcriptRevision.findMany({
        where: { transcriptId: transcript.id },
        include: {
          editor: {
            select: { id: true, displayName: true, email: true },
          },
        },
        orderBy: { revisionNumber: 'desc' },
      });
    });
  }

  async updateTranscript(
    principal: Principal,
    sessionId: string,
    expectedVersion: number,
    input: UpdateTranscriptDto,
  ) {
    this.assertHost(principal);
    if (input.language === undefined && input.segments === undefined) {
      throw new BadRequestException(
        'Provide a language tag or corrected transcript segments',
      );
    }
    if (input.segments !== undefined) {
      if (input.segments.length === 0) {
        throw new BadRequestException('A ready transcript must contain at least one segment');
      }
      for (let index = 0; index < input.segments.length; index += 1) {
        const segment = input.segments[index];
        if (!segment) continue;
        if (segment.endMs < segment.startMs) {
          throw new BadRequestException(
            `Segment ${index + 1} ends before it starts`,
          );
        }
        if (
          index > 0 &&
          input.segments[index - 1] &&
          segment.startMs < input.segments[index - 1]!.startMs
        ) {
          throw new BadRequestException(
            'Transcript segments must be ordered by start time',
          );
        }
      }
    }

    const result = await this.database.run(principal, async (transaction) => {
      const transcript = await transaction.transcript.findUnique({
        where: { sessionId },
        include: { segments: { orderBy: { position: 'asc' } } },
      });
      if (!transcript) throw new NotFoundException('Transcript not found');
      if (transcript.status !== ArtifactStatus.READY) {
        throw new BadRequestException('Only ready transcripts can be corrected');
      }

      const updated = await transaction.transcript.updateMany({
        where: { id: transcript.id, version: expectedVersion },
        data: {
          ...(input.language !== undefined
            ? { language: input.language.trim() }
            : {}),
          ...(input.segments !== undefined
            ? {
                fullText: input.segments
                  .map((segment) => segment.text.trim())
                  .filter(Boolean)
                  .join('\n'),
              }
            : {}),
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        throw new ConflictException(
          'Transcript changed since it was loaded. Refresh and retry.',
        );
      }

      const latestRevision = await transaction.transcriptRevision.aggregate({
        where: { transcriptId: transcript.id },
        _max: { revisionNumber: true },
      });
      await transaction.transcriptRevision.create({
        data: {
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          transcriptId: transcript.id,
          editorUserId: principal.userId,
          revisionNumber: (latestRevision._max.revisionNumber ?? 0) + 1,
          language: transcript.language,
          fullText: transcript.fullText,
          segments: this.toJson(
            transcript.segments.map((segment) => ({
              startMs: segment.startMs,
              endMs: segment.endMs,
              speakerLabel: segment.speakerLabel,
              text: segment.text,
            })),
          ),
          reason: input.reason?.trim() || null,
        },
      });

      if (input.segments !== undefined) {
        await transaction.transcriptSegment.deleteMany({
          where: { transcriptId: transcript.id },
        });
        await transaction.transcriptSegment.createMany({
          data: input.segments.map((segment, position) => ({
            organizationId: principal.organizationId,
            workspaceId: principal.workspaceId,
            transcriptId: transcript.id,
            position,
            startMs: segment.startMs,
            endMs: segment.endMs,
            speakerLabel: segment.speakerLabel?.trim() || null,
            text: segment.text.trim(),
          })),
        });
      }

      const summary = await transaction.memorySummary.findUnique({
        where: { sessionId },
      });
      if (summary) {
        await transaction.memorySummary.update({
          where: { id: summary.id },
          data: {
            status: ArtifactStatus.PENDING,
            failureCode: null,
            completedAt: null,
            sourceTranscriptVersion: null,
            version: { increment: 1 },
          },
        });
        await this.outbox.enqueue(transaction, principal, {
          aggregateType: 'memory_summary',
          aggregateId: summary.id,
          eventType: 'memory.summary.requested',
          payload: {
            memorySummaryId: summary.id,
            sessionId,
            reason: 'transcript_corrected',
          },
        });
      }

      const value = await transaction.transcript.findUniqueOrThrow({
        where: { id: transcript.id },
        include: { segments: { orderBy: { position: 'asc' } } },
      });
      await this.audit.record(transaction, principal, {
        action: 'transcript.corrected',
        resourceType: 'transcript',
        resourceId: transcript.id,
        metadata: {
          sessionId,
          version: value.version,
          languageChanged: input.language !== undefined,
          segmentsChanged: input.segments !== undefined,
          reason: input.reason?.trim() || null,
        },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'transcript',
        aggregateId: transcript.id,
        eventType: 'transcript.corrected',
        payload: {
          transcriptId: transcript.id,
          sessionId,
          version: value.version,
          language: value.language,
          segmentCount: value.segments.length,
        },
      });
      return value;
    });

    this.realtime.publishSessionEvent({
      sessionId,
      eventName: 'memory.updated',
      payload: {
        sessionId,
        artifact: 'transcript',
        status: result.status,
        version: result.version,
      },
    });
    return result;
  }

  async restoreTranscriptRevision(
    principal: Principal,
    sessionId: string,
    revisionId: string,
    expectedVersion: number,
  ) {
    this.assertHost(principal);
    const result = await this.database.run(principal, async (transaction) => {
      const transcript = await transaction.transcript.findUnique({
        where: { sessionId },
        include: { segments: { orderBy: { position: 'asc' } } },
      });
      if (!transcript) throw new NotFoundException('Transcript not found');
      if (transcript.status !== ArtifactStatus.READY) {
        throw new BadRequestException('Only ready transcripts can restore revisions');
      }
      const revision = await transaction.transcriptRevision.findFirst({
        where: { id: revisionId, transcriptId: transcript.id },
      });
      if (!revision) throw new NotFoundException('Transcript revision not found');

      const rawSegments = Array.isArray(revision.segments)
        ? revision.segments
        : [];
      const restoredSegments = rawSegments
        .map((value) => {
          if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
          const entry = value as Record<string, unknown>;
          if (
            typeof entry.startMs !== 'number' ||
            typeof entry.endMs !== 'number' ||
            typeof entry.text !== 'string'
          ) {
            return null;
          }
          return {
            startMs: entry.startMs,
            endMs: entry.endMs,
            speakerLabel:
              typeof entry.speakerLabel === 'string' ? entry.speakerLabel : null,
            text: entry.text,
          };
        })
        .filter(
          (
            segment,
          ): segment is {
            startMs: number;
            endMs: number;
            speakerLabel: string | null;
            text: string;
          } => segment !== null,
        );
      if (restoredSegments.length === 0) {
        throw new BadRequestException('The selected revision has no restorable segments');
      }

      const updated = await transaction.transcript.updateMany({
        where: { id: transcript.id, version: expectedVersion },
        data: {
          language: revision.language,
          fullText:
            revision.fullText ??
            restoredSegments.map((segment) => segment.text).join('\n'),
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        throw new ConflictException(
          'Transcript changed since it was loaded. Refresh and retry.',
        );
      }

      const latestRevision = await transaction.transcriptRevision.aggregate({
        where: { transcriptId: transcript.id },
        _max: { revisionNumber: true },
      });
      await transaction.transcriptRevision.create({
        data: {
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          transcriptId: transcript.id,
          editorUserId: principal.userId,
          revisionNumber: (latestRevision._max.revisionNumber ?? 0) + 1,
          language: transcript.language,
          fullText: transcript.fullText,
          segments: this.toJson(
            transcript.segments.map((segment) => ({
              startMs: segment.startMs,
              endMs: segment.endMs,
              speakerLabel: segment.speakerLabel,
              text: segment.text,
            })),
          ),
          reason: `Restore before revision ${revision.revisionNumber}`,
        },
      });

      await transaction.transcriptSegment.deleteMany({
        where: { transcriptId: transcript.id },
      });
      await transaction.transcriptSegment.createMany({
        data: restoredSegments.map((segment, position) => ({
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          transcriptId: transcript.id,
          position,
          startMs: segment.startMs,
          endMs: segment.endMs,
          speakerLabel: segment.speakerLabel,
          text: segment.text,
        })),
      });

      const summary = await transaction.memorySummary.findUnique({
        where: { sessionId },
      });
      if (summary) {
        await transaction.memorySummary.update({
          where: { id: summary.id },
          data: {
            status: ArtifactStatus.PENDING,
            failureCode: null,
            completedAt: null,
            sourceTranscriptVersion: null,
            version: { increment: 1 },
          },
        });
        await this.outbox.enqueue(transaction, principal, {
          aggregateType: 'memory_summary',
          aggregateId: summary.id,
          eventType: 'memory.summary.requested',
          payload: {
            memorySummaryId: summary.id,
            sessionId,
            reason: 'transcript_revision_restored',
          },
        });
      }

      const value = await transaction.transcript.findUniqueOrThrow({
        where: { id: transcript.id },
        include: { segments: { orderBy: { position: 'asc' } } },
      });
      await this.audit.record(transaction, principal, {
        action: 'transcript.revision_restored',
        resourceType: 'transcript',
        resourceId: transcript.id,
        metadata: {
          sessionId,
          restoredRevisionId: revision.id,
          restoredRevisionNumber: revision.revisionNumber,
          version: value.version,
        },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'transcript',
        aggregateId: transcript.id,
        eventType: 'transcript.revision_restored',
        payload: {
          transcriptId: transcript.id,
          sessionId,
          revisionId: revision.id,
          revisionNumber: revision.revisionNumber,
          version: value.version,
        },
      });
      return value;
    });

    this.realtime.publishSessionEvent({
      sessionId,
      eventName: 'memory.updated',
      payload: {
        sessionId,
        artifact: 'transcript',
        status: result.status,
        version: result.version,
      },
    });
    return result;
  }

  async updateSummary(
    principal: Principal,
    sessionId: string,
    expectedVersion: number,
    input: UpdateMemorySummaryDto,
  ) {
    this.assertHost(principal);
    if (
      input.summaryText === undefined &&
      input.decisions === undefined &&
      input.actionItems === undefined &&
      input.citations === undefined
    ) {
      throw new BadRequestException('At least one summary field must be provided');
    }

    const result = await this.database.run(principal, async (transaction) => {
      const summary = await transaction.memorySummary.findUnique({
        where: { sessionId },
      });
      if (!summary) throw new NotFoundException('Memory summary not found');
      if (summary.status !== ArtifactStatus.READY) {
        throw new BadRequestException(
          'Only ready summaries can be reviewed and edited',
        );
      }

      const updated = await transaction.memorySummary.updateMany({
        where: { id: summary.id, version: expectedVersion },
        data: {
          ...(input.summaryText !== undefined
            ? { summaryText: input.summaryText.trim() }
            : {}),
          ...(input.decisions !== undefined
            ? { decisions: this.toJson(input.decisions) }
            : {}),
          ...(input.actionItems !== undefined
            ? { actionItems: this.toJson(input.actionItems) }
            : {}),
          ...(input.citations !== undefined
            ? { citations: this.toJson(input.citations) }
            : {}),
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        throw new ConflictException(
          'Memory summary changed since it was loaded. Refresh and retry.',
        );
      }

      const value = await transaction.memorySummary.findUniqueOrThrow({
        where: { id: summary.id },
      });
      await this.audit.record(transaction, principal, {
        action: 'memory.summary.reviewed',
        resourceType: 'memory_summary',
        resourceId: summary.id,
        metadata: {
          sessionId,
          version: value.version,
          changedFields: [
            input.summaryText !== undefined ? 'summaryText' : null,
            input.decisions !== undefined ? 'decisions' : null,
            input.actionItems !== undefined ? 'actionItems' : null,
            input.citations !== undefined ? 'citations' : null,
          ].filter((field): field is string => field !== null),
        },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'memory_summary',
        aggregateId: summary.id,
        eventType: 'memory.summary.reviewed',
        payload: {
          memorySummaryId: summary.id,
          sessionId,
          version: value.version,
        },
      });
      return value;
    });

    this.realtime.publishSessionEvent({
      sessionId,
      eventName: 'memory.updated',
      payload: {
        sessionId,
        artifact: 'summary',
        status: result.status,
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

  private async searchMemory(
    transaction: Prisma.TransactionClient,
    principal: Principal,
    searchTerm: string,
    page: number,
    pageSize: number,
  ) {
    const offset = (page - 1) * pageSize;
    const hits = await transaction.$queryRaw<MemorySearchHit[]>`
      WITH search_query AS (
        SELECT websearch_to_tsquery('simple', ${searchTerm}) AS query
      )
      SELECT
        s.id::text AS "id",
        (
          (
            ts_rank_cd(
              setweight(to_tsvector('simple', COALESCE(s.title, '')), 'A') ||
              setweight(to_tsvector('simple', COALESCE(s.description, '')), 'B'),
              search_query.query,
              32
            ) * 2
          ) +
          ts_rank_cd(
            setweight(to_tsvector('simple', COALESCE(t.full_text, '')), 'C'),
            search_query.query,
            32
          )
        )::double precision AS "rank",
        CASE
          WHEN t.full_text IS NOT NULL
            AND to_tsvector('simple', t.full_text) @@ search_query.query
          THEN regexp_replace(
            ts_headline(
              'simple',
              t.full_text,
              search_query.query,
              'MaxWords=32, MinWords=8, ShortWord=3, HighlightAll=false'
            ),
            '</?b>',
            '',
            'gi'
          )
          WHEN s.description IS NOT NULL
            AND to_tsvector('simple', s.description) @@ search_query.query
          THEN regexp_replace(
            ts_headline(
              'simple',
              s.description,
              search_query.query,
              'MaxWords=32, MinWords=8, ShortWord=3, HighlightAll=false'
            ),
            '</?b>',
            '',
            'gi'
          )
          ELSE s.title
        END AS "excerpt",
        COUNT(*) OVER()::integer AS "totalCount"
      FROM sessions s
      LEFT JOIN transcripts t ON t.session_id = s.id
      LEFT JOIN recordings r ON r.session_id = s.id
      LEFT JOIN memory_summaries ms ON ms.session_id = s.id
      CROSS JOIN search_query
      WHERE
        s.organization_id = ${principal.organizationId}::uuid
        AND s.workspace_id = ${principal.workspaceId}::uuid
        AND (
          s.status IN ('ENDED', 'PROCESSING', 'READY', 'FAILED')
          OR r.id IS NOT NULL
          OR t.id IS NOT NULL
          OR ms.id IS NOT NULL
        )
        AND (
          to_tsvector(
            'simple',
            COALESCE(s.title, '') || ' ' || COALESCE(s.description, '')
          ) @@ search_query.query
          OR to_tsvector('simple', COALESCE(t.full_text, '')) @@ search_query.query
        )
      ORDER BY "rank" DESC, s.starts_at DESC, s.id
      LIMIT ${pageSize}
      OFFSET ${offset}
    `;

    const ids = hits.map((hit) => hit.id);
    const records =
      ids.length === 0
        ? []
        : await transaction.session.findMany({
            where: { id: { in: ids } },
            include: {
              recording: true,
              transcript: {
                select: {
                  id: true,
                  status: true,
                  language: true,
                  completedAt: true,
                  version: true,
                },
              },
              memorySummary: true,
              _count: {
                select: { chatMessages: true, polls: true, questions: true },
              },
            },
          });
    const recordsById = new Map(records.map((item) => [item.id, item]));
    const items = hits.flatMap((hit) => {
      const item = recordsById.get(hit.id);
      return item
        ? [
            {
              ...item,
              search: {
                rank: hit.rank,
                excerpt: hit.excerpt,
              },
            },
          ]
        : [];
    });

    return {
      items,
      page,
      pageSize,
      total: hits[0]?.totalCount ?? 0,
    };
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private assertHost(principal: Principal): void {
    if (!hasAnyRole(principal, HOST_ROLES)) {
      throw new ForbiddenException('A host role is required');
    }
  }
}
