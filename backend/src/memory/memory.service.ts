import {
  BadRequestException,
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
import {
  normalizeTranscriptCorrection,
  transcriptCorrectionError,
} from './transcript-correction';
import {
  memorySummaryReviewError,
  normalizeMemorySummaryReview,
} from './memory-summary-review';

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
                    {
                      transcript: {
                        is: {
                          fullText: {
                            contains: query.query,
                            mode: 'insensitive',
                          },
                        },
                      },
                    },
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
    return this.database.run(principal, async (transaction) => {
      const transcript = await transaction.transcript.findUnique({
        where: { sessionId },
        select: { id: true },
      });
      if (!transcript) throw new NotFoundException('Transcript not found');

      return transaction.transcriptRevision.findMany({
        where: { transcriptId: transcript.id },
        select: {
          id: true,
          transcriptVersion: true,
          editedByUserId: true,
          reason: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
    });
  }

  async updateTranscript(
    principal: Principal,
    sessionId: string,
    input: UpdateTranscriptDto,
  ) {
    this.assertHost(principal);

    const normalized = normalizeTranscriptCorrection(input.segments);
    const correctionError = transcriptCorrectionError(normalized);
    if (correctionError) {
      throw new BadRequestException(correctionError);
    }

    const result = await this.database.run(principal, async (transaction) => {
      const transcript = await transaction.transcript.findUnique({
        where: { sessionId },
        include: { segments: { orderBy: { position: 'asc' } } },
      });
      if (!transcript) throw new NotFoundException('Transcript not found');
      if (transcript.status !== ArtifactStatus.READY) {
        throw new BadRequestException(
          'Only a ready transcript can be corrected',
        );
      }

      const snapshotSegments = transcript.segments.map((segment) => ({
        position: segment.position,
        startMs: segment.startMs,
        endMs: segment.endMs,
        speakerLabel: segment.speakerLabel,
        text: segment.text,
      }));
      const snapshotText =
        transcript.fullText ??
        snapshotSegments.map((segment) => segment.text).join('\n');

      await transaction.transcriptRevision.create({
        data: {
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          transcriptId: transcript.id,
          editedByUserId: principal.userId,
          transcriptVersion: transcript.version,
          fullText: snapshotText,
          segments: snapshotSegments as Prisma.InputJsonValue,
          reason: input.reason?.trim() || null,
        },
      });

      await transaction.transcriptSegment.deleteMany({
        where: { transcriptId: transcript.id },
      });

      await transaction.transcriptSegment.createMany({
        data: normalized.map((segment) => ({
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          transcriptId: transcript.id,
          position: segment.position,
          startMs: segment.startMs,
          endMs: segment.endMs,
          speakerLabel: segment.speakerLabel,
          text: segment.text,
        })),
      });

      const fullText = normalized.map((segment) => segment.text).join('\n');
      const updated = await transaction.transcript.update({
        where: { id: transcript.id },
        data: {
          fullText,
          version: { increment: 1 },
        },
        include: { segments: { orderBy: { position: 'asc' } } },
      });

      await this.audit.record(transaction, principal, {
        action: 'transcript.corrected',
        resourceType: 'transcript',
        resourceId: transcript.id,
        metadata: {
          sessionId,
          previousVersion: transcript.version,
          newVersion: updated.version,
          segmentCount: normalized.length,
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
          version: updated.version,
          segmentCount: normalized.length,
        },
      });

      return updated;
    });

    this.realtime.publishSessionEvent({
      sessionId,
      eventName: 'memory.updated',
      payload: {
        sessionId,
        transcriptId: result.id,
        transcriptVersion: result.version,
      },
    });
    return result;
  }

  async listMemorySummaryRevisions(
    principal: Principal,
    sessionId: string,
  ) {
    return this.database.run(principal, async (transaction) => {
      const summary = await transaction.memorySummary.findUnique({
        where: { sessionId },
        select: { id: true },
      });
      if (!summary) throw new NotFoundException('Memory summary not found');

      return transaction.memorySummaryRevision.findMany({
        where: { memorySummaryId: summary.id },
        select: {
          id: true,
          summaryVersion: true,
          editedByUserId: true,
          reviewNote: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
    });
  }

  async updateMemorySummary(
    principal: Principal,
    sessionId: string,
    input: UpdateMemorySummaryDto,
  ) {
    this.assertHost(principal);

    const normalized = normalizeMemorySummaryReview(input);
    const reviewError = memorySummaryReviewError(normalized);
    if (reviewError) throw new BadRequestException(reviewError);

    const result = await this.database.run(principal, async (transaction) => {
      const summary = await transaction.memorySummary.findUnique({
        where: { sessionId },
      });
      if (!summary) throw new NotFoundException('Memory summary not found');
      if (summary.status !== ArtifactStatus.READY) {
        throw new BadRequestException(
          'Only a ready memory summary can be reviewed',
        );
      }

      await transaction.memorySummaryRevision.create({
        data: {
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          memorySummaryId: summary.id,
          editedByUserId: principal.userId,
          summaryVersion: summary.version,
          summaryText: summary.summaryText ?? '',
          decisions: summary.decisions as Prisma.InputJsonValue,
          actionItems: summary.actionItems as Prisma.InputJsonValue,
          reviewNote: summary.reviewNote,
        },
      });

      const reviewedAt = new Date();
      const updated = await transaction.memorySummary.update({
        where: { id: summary.id },
        data: {
          summaryText: normalized.summaryText,
          decisions: normalized.decisions as Prisma.InputJsonValue,
          actionItems:
            normalized.actionItems as unknown as Prisma.InputJsonValue,
          reviewedAt,
          reviewedByUserId: principal.userId,
          reviewNote: normalized.reviewNote,
          version: { increment: 1 },
        },
      });

      await this.audit.record(transaction, principal, {
        action: 'memory.summary.reviewed',
        resourceType: 'memory_summary',
        resourceId: summary.id,
        metadata: {
          sessionId,
          previousVersion: summary.version,
          newVersion: updated.version,
          decisionCount: normalized.decisions.length,
          actionItemCount: normalized.actionItems.length,
          reviewNote: normalized.reviewNote,
        },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'memory_summary',
        aggregateId: summary.id,
        eventType: 'memory.summary.reviewed',
        payload: {
          memorySummaryId: summary.id,
          sessionId,
          version: updated.version,
          reviewedByUserId: principal.userId,
          reviewedAt: reviewedAt.toISOString(),
        },
      });

      return updated;
    });

    this.realtime.publishSessionEvent({
      sessionId,
      eventName: 'memory.updated',
      payload: {
        sessionId,
        memorySummaryId: result.id,
        summaryVersion: result.version,
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
