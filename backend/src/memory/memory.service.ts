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

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private assertHost(principal: Principal): void {
    if (!hasAnyRole(principal, HOST_ROLES)) {
      throw new ForbiddenException('A host role is required');
    }
  }
}
