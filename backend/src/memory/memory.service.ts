import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AiExternalActionKind,
  AiExternalActionStatus,
  ArtifactStatus,
  Prisma,
  SessionStatus,
  type Session,
} from '@prisma/client';
import { AiProviderService } from '../ai/ai-provider.service';
import { AuditService } from '../audit/audit.service';
import { HOST_ROLES, hasAnyRole, type Principal } from '../common/auth/principal';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { RealtimeEventsService } from '../infrastructure/realtime-events.service';
import { OutboxService } from '../outbox/outbox.service';
import { CreateCrmNoteDto } from './dto/create-crm-note.dto';
import { CreateFollowUpEmailDto } from './dto/create-follow-up-email.dto';
import { ListMemoryQuery } from './dto/list-memory.query';
import { EmbeddingProviderService } from './embedding-provider.service';
import { UpdateAiExternalActionDto } from './dto/update-ai-external-action.dto';
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
    private readonly embeddings: EmbeddingProviderService,
    private readonly ai: AiProviderService,
  ) {}

  async list(principal: Principal, query: ListMemoryQuery) {
    return this.database.run(principal, async (transaction) => {
      const searchTerm = query.query?.trim();
      if (searchTerm) {
        if (query.searchMode === 'semantic') {
          const semantic = await this.searchSemanticMemory(
            transaction,
            principal,
            searchTerm,
            query.page,
            query.pageSize,
          );
          if (semantic.items.length > 0) return semantic;
        }
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
      await transaction.aiExternalAction.updateMany({
        where: {
          sessionId,
          status: {
            in: [
              AiExternalActionStatus.DRAFT,
              AiExternalActionStatus.APPROVED,
            ],
          },
          sourceSummaryVersion: { not: value.version },
        },
        data: {
          status: AiExternalActionStatus.CANCELLED,
          failureCode: 'source_summary_changed',
          version: { increment: 1 },
        },
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

  async listExternalActions(principal: Principal, sessionId: string) {
    this.assertHost(principal);
    return this.database.run(principal, async (transaction) => {
      const session = await transaction.session.findUnique({
        where: { id: sessionId },
        select: { id: true },
      });
      if (!session) throw new NotFoundException('Session not found');
      return transaction.aiExternalAction.findMany({
        where: { sessionId },
        include: {
          approvedBy: {
            select: { id: true, displayName: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
    });
  }

  async createFollowUpEmailDraft(
    principal: Principal,
    sessionId: string,
    input: CreateFollowUpEmailDto,
  ) {
    return this.createExternalDraft(
      principal,
      sessionId,
      AiExternalActionKind.EMAIL_FOLLOW_UP,
      {
        recipientEmail: input.recipientEmail.trim(),
        guidance: input.guidance?.trim() || null,
      },
    );
  }

  async createCrmNoteDraft(
    principal: Principal,
    sessionId: string,
    input: CreateCrmNoteDto,
  ) {
    return this.createExternalDraft(
      principal,
      sessionId,
      AiExternalActionKind.CRM_NOTE,
      {
        targetProvider: input.targetProvider.trim(),
        targetRecordId: input.targetRecordId.trim(),
        guidance: input.guidance?.trim() || null,
      },
    );
  }

  async updateExternalAction(
    principal: Principal,
    sessionId: string,
    actionId: string,
    expectedVersion: number,
    input: UpdateAiExternalActionDto,
  ) {
    this.assertHost(principal);
    return this.database.run(principal, async (transaction) => {
      const action = await transaction.aiExternalAction.findFirst({
        where: { id: actionId, sessionId },
      });
      if (!action) throw new NotFoundException('AI external action not found');
      if (action.status !== AiExternalActionStatus.DRAFT) {
        throw new ConflictException('Only draft external actions can be edited');
      }

      const updated = await transaction.aiExternalAction.updateMany({
        where: {
          id: action.id,
          version: expectedVersion,
          status: AiExternalActionStatus.DRAFT,
        },
        data: {
          ...(input.recipientEmail !== undefined
            ? { recipientEmail: input.recipientEmail.trim() }
            : {}),
          ...(input.subject !== undefined
            ? { subject: input.subject.trim() }
            : {}),
          ...(input.bodyText !== undefined
            ? { bodyText: input.bodyText.trim() }
            : {}),
          ...(input.targetProvider !== undefined
            ? { targetProvider: input.targetProvider.trim() }
            : {}),
          ...(input.targetRecordId !== undefined
            ? { targetRecordId: input.targetRecordId.trim() }
            : {}),
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        throw new ConflictException(
          'External action changed since it was loaded. Refresh and retry.',
        );
      }
      const value = await transaction.aiExternalAction.findUniqueOrThrow({
        where: { id: action.id },
      });
      this.assertExternalActionComplete(value);
      await this.audit.record(transaction, principal, {
        action: 'ai.external_action.edited',
        resourceType: 'ai_external_action',
        resourceId: action.id,
        metadata: { sessionId, kind: value.kind, version: value.version },
      });
      return value;
    });
  }

  async approveExternalAction(
    principal: Principal,
    sessionId: string,
    actionId: string,
    expectedVersion: number,
  ) {
    this.assertHost(principal);
    return this.database.run(principal, async (transaction) => {
      const action = await transaction.aiExternalAction.findFirst({
        where: { id: actionId, sessionId },
      });
      if (!action) throw new NotFoundException('AI external action not found');
      if (action.status !== AiExternalActionStatus.DRAFT) {
        throw new ConflictException('Only draft external actions can be approved');
      }
      this.assertExternalActionComplete(action);

      const summary = await transaction.memorySummary.findUnique({
        where: { sessionId },
        select: { version: true, status: true },
      });
      if (
        !summary ||
        summary.status !== ArtifactStatus.READY ||
        summary.version !== action.sourceSummaryVersion
      ) {
        throw new ConflictException(
          'Reviewed summary changed after this draft was created. Generate a new draft.',
        );
      }

      const updated = await transaction.aiExternalAction.updateMany({
        where: {
          id: action.id,
          version: expectedVersion,
          status: AiExternalActionStatus.DRAFT,
        },
        data: {
          status: AiExternalActionStatus.APPROVED,
          approvedById: principal.userId,
          approvedAt: new Date(),
          failureCode: null,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        throw new ConflictException(
          'External action changed since it was loaded. Refresh and retry.',
        );
      }
      const value = await transaction.aiExternalAction.findUniqueOrThrow({
        where: { id: action.id },
      });
      await this.audit.record(transaction, principal, {
        action: 'ai.external_action.approved',
        resourceType: 'ai_external_action',
        resourceId: action.id,
        metadata: { sessionId, kind: value.kind, version: value.version },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'ai_external_action',
        aggregateId: action.id,
        eventType: 'ai.external_action.approved',
        payload: {
          actionId: action.id,
          sessionId,
          kind: value.kind,
          approvedById: principal.userId,
        },
      });
      return value;
    });
  }

  async retryExternalAction(
    principal: Principal,
    sessionId: string,
    actionId: string,
  ) {
    this.assertHost(principal);
    return this.database.run(principal, async (transaction) => {
      const action = await transaction.aiExternalAction.findFirst({
        where: { id: actionId, sessionId },
      });
      if (!action) throw new NotFoundException('AI external action not found');
      if (action.status !== AiExternalActionStatus.FAILED) {
        throw new ConflictException('Only failed external actions can be retried');
      }
      const summary = await transaction.memorySummary.findUnique({
        where: { sessionId },
        select: { version: true, status: true },
      });
      if (
        !summary ||
        summary.status !== ArtifactStatus.READY ||
        summary.version !== action.sourceSummaryVersion
      ) {
        throw new ConflictException(
          'Reviewed summary changed after approval. Generate a new draft.',
        );
      }
      const value = await transaction.aiExternalAction.update({
        where: { id: action.id },
        data: {
          status: AiExternalActionStatus.APPROVED,
          failureCode: null,
          version: { increment: 1 },
        },
      });
      await this.audit.record(transaction, principal, {
        action: 'ai.external_action.retry_requested',
        resourceType: 'ai_external_action',
        resourceId: action.id,
        metadata: { sessionId, kind: value.kind },
      });
      return value;
    });
  }

  async cancelExternalAction(
    principal: Principal,
    sessionId: string,
    actionId: string,
  ) {
    this.assertHost(principal);
    return this.database.run(principal, async (transaction) => {
      const action = await transaction.aiExternalAction.findFirst({
        where: { id: actionId, sessionId },
      });
      if (!action) throw new NotFoundException('AI external action not found');
      if (
        ![
          AiExternalActionStatus.DRAFT,
          AiExternalActionStatus.APPROVED,
          AiExternalActionStatus.FAILED,
        ].includes(action.status)
      ) {
        throw new ConflictException('This external action can no longer be cancelled');
      }
      const value = await transaction.aiExternalAction.update({
        where: { id: action.id },
        data: {
          status: AiExternalActionStatus.CANCELLED,
          failureCode: 'cancelled_by_user',
          version: { increment: 1 },
        },
      });
      await this.audit.record(transaction, principal, {
        action: 'ai.external_action.cancelled',
        resourceType: 'ai_external_action',
        resourceId: action.id,
        metadata: { sessionId, kind: value.kind },
      });
      return value;
    });
  }

  async retrySemanticIndex(principal: Principal, sessionId: string) {
    this.assertHost(principal);
    return this.database.run(principal, async (transaction) => {
      const transcript = await transaction.transcript.findUnique({
        where: { sessionId },
        select: { id: true, status: true, fullText: true },
      });
      if (!transcript) throw new NotFoundException('Transcript not found');
      if (
        transcript.status !== ArtifactStatus.READY ||
        !transcript.fullText?.trim()
      ) {
        throw new BadRequestException(
          'A ready transcript with text is required for semantic indexing',
        );
      }

      await transaction.$executeRawUnsafe(
        "UPDATE memory_embedding_indexes SET status = 'PENDING', failure_code = NULL, completed_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE transcript_id = $1::uuid",
        transcript.id,
      );
      await this.audit.record(transaction, principal, {
        action: 'memory.semantic_index.retry_requested',
        resourceType: 'transcript',
        resourceId: transcript.id,
        metadata: { sessionId },
      });
      return { sessionId, transcriptId: transcript.id, accepted: true as const };
    });
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

  private async createExternalDraft(
    principal: Principal,
    sessionId: string,
    kind: AiExternalActionKind,
    target: {
      recipientEmail?: string;
      targetProvider?: string;
      targetRecordId?: string;
      guidance?: string | null;
    },
  ) {
    this.assertHost(principal);
    if (!this.ai.isEnabled()) {
      throw new BadRequestException('AI provider is disabled');
    }

    const context = await this.database.run(principal, async (transaction) => {
      const session = await transaction.session.findUnique({
        where: { id: sessionId },
        select: { id: true, title: true },
      });
      if (!session) throw new NotFoundException('Session not found');
      const summary = await transaction.memorySummary.findUnique({
        where: { sessionId },
      });
      if (
        !summary ||
        summary.status !== ArtifactStatus.READY ||
        !summary.summaryText?.trim()
      ) {
        throw new BadRequestException(
          'A reviewed, ready summary is required before drafting an external action',
        );
      }
      return { session, summary };
    });

    const draft = await this.ai.generateFollowUpDraft({
      title: context.session.title,
      summaryText: context.summary.summaryText!,
      decisions: this.summaryDecisions(context.summary.decisions),
      actionItems: this.summaryActionItems(context.summary.actionItems),
      guidance: target.guidance,
    });

    return this.database.run(principal, async (transaction) => {
      const currentSummary = await transaction.memorySummary.findUnique({
        where: { sessionId },
        select: { version: true, status: true },
      });
      if (
        !currentSummary ||
        currentSummary.status !== ArtifactStatus.READY ||
        currentSummary.version !== context.summary.version
      ) {
        throw new ConflictException(
          'Reviewed summary changed while the draft was being generated. Retry.',
        );
      }

      const value = await transaction.aiExternalAction.create({
        data: {
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          sessionId,
          kind,
          sourceSummaryVersion: context.summary.version,
          draftProvider: draft.provider,
          draftModel: draft.model ?? null,
          recipientEmail:
            kind === AiExternalActionKind.EMAIL_FOLLOW_UP
              ? target.recipientEmail
              : null,
          subject:
            kind === AiExternalActionKind.EMAIL_FOLLOW_UP
              ? draft.emailSubject
              : null,
          bodyText:
            kind === AiExternalActionKind.EMAIL_FOLLOW_UP
              ? draft.emailBody
              : draft.crmNote,
          targetProvider:
            kind === AiExternalActionKind.CRM_NOTE
              ? target.targetProvider
              : null,
          targetRecordId:
            kind === AiExternalActionKind.CRM_NOTE
              ? target.targetRecordId
              : null,
        },
      });
      await this.audit.record(transaction, principal, {
        action: 'ai.external_action.drafted',
        resourceType: 'ai_external_action',
        resourceId: value.id,
        metadata: {
          sessionId,
          kind,
          sourceSummaryVersion: context.summary.version,
          provider: draft.provider,
          model: draft.model ?? null,
        },
      });
      return value;
    });
  }

  private assertExternalActionComplete(action: {
    kind: AiExternalActionKind;
    recipientEmail: string | null;
    subject: string | null;
    bodyText: string;
    targetProvider: string | null;
    targetRecordId: string | null;
  }): void {
    if (!action.bodyText.trim()) {
      throw new BadRequestException('External action body cannot be empty');
    }
    if (
      action.kind === AiExternalActionKind.EMAIL_FOLLOW_UP &&
      (!action.recipientEmail || !action.subject?.trim())
    ) {
      throw new BadRequestException(
        'Follow-up email requires recipient, subject, and body',
      );
    }
    if (
      action.kind === AiExternalActionKind.CRM_NOTE &&
      (!action.targetProvider?.trim() || !action.targetRecordId?.trim())
    ) {
      throw new BadRequestException(
        'CRM note requires provider, target record, and body',
      );
    }
  }

  private summaryDecisions(value: Prisma.JsonValue): Array<{ text: string }> {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
      const text = (item as Record<string, unknown>).text;
      return typeof text === 'string' && text.trim()
        ? [{ text: text.trim() }]
        : [];
    });
  }

  private summaryActionItems(value: Prisma.JsonValue): Array<{
    text: string;
    owner?: string | null;
    dueDate?: string | null;
  }> {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
      const entry = item as Record<string, unknown>;
      const text = typeof entry.text === 'string' ? entry.text.trim() : '';
      if (!text) return [];
      return [{
        text,
        ...(typeof entry.owner === 'string'
          ? { owner: entry.owner.trim() || null }
          : {}),
        ...(typeof entry.dueDate === 'string'
          ? { dueDate: entry.dueDate.trim() || null }
          : {}),
      }];
    });
  }

  private async searchSemanticMemory(
    transaction: Prisma.TransactionClient,
    principal: Principal,
    searchTerm: string,
    page: number,
    pageSize: number,
  ) {
    if (!this.embeddings.isEnabled()) {
      return { items: [], page, pageSize, total: 0 };
    }

    const embedded = await this.embeddings.embed([searchTerm]);
    const vector = embedded.vectors[0];
    if (!vector) return { items: [], page, pageSize, total: 0 };
    const vectorLiteral = '[' + vector.join(',') + ']';
    const offset = (page - 1) * pageSize;

    const hits = await transaction.$queryRawUnsafe<MemorySearchHit[]>(
      "WITH ranked AS (SELECT c.session_id::text AS id, MAX(1 - (c.embedding <=> $1::vector))::double precision AS rank, (array_agg(c.content ORDER BY c.embedding <=> $1::vector))[1] AS excerpt FROM memory_embedding_chunks c JOIN memory_embedding_indexes i ON i.id = c.index_id JOIN transcripts t ON t.id = c.transcript_id WHERE c.organization_id = $2::uuid AND c.workspace_id = $3::uuid AND i.status = 'READY' AND i.source_transcript_version = t.version GROUP BY c.session_id) SELECT id AS \"id\", rank AS \"rank\", excerpt AS \"excerpt\", COUNT(*) OVER()::integer AS \"totalCount\" FROM ranked ORDER BY rank DESC, id LIMIT $4 OFFSET $5",
      vectorLiteral,
      principal.organizationId,
      principal.workspaceId,
      pageSize,
      offset,
    );

    return this.hydrateSearchHits(transaction, hits, page, pageSize, 'semantic');
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

    return this.hydrateSearchHits(transaction, hits, page, pageSize, 'lexical');
  }

  private async hydrateSearchHits(
    transaction: Prisma.TransactionClient,
    hits: MemorySearchHit[],
    page: number,
    pageSize: number,
    mode: 'lexical' | 'semantic',
  ) {
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
                mode,
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
