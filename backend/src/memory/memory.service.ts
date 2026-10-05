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
import { HttpAiProvider } from '../ai/http-ai.provider';
import type { AiActionItem, AiDecision } from '../ai/ai.types';
import { AuditService } from '../audit/audit.service';
import { HOST_ROLES, hasAnyRole, type Principal } from '../common/auth/principal';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { RealtimeEventsService } from '../infrastructure/realtime-events.service';
import { OutboxService } from '../outbox/outbox.service';
import { ListMemoryQuery } from './dto/list-memory.query';
import { SendFollowUpDto } from './dto/send-follow-up.dto';
import { UpdateFollowUpDraftDto } from './dto/update-follow-up-draft.dto';
import { UpdateMemorySummaryDto } from './dto/update-memory-summary.dto';
import { UpdateTranscriptSegmentDto } from './dto/update-transcript-segment.dto';

@Injectable()
export class MemoryService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly ai: HttpAiProvider,
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
          emailDeliveries: {
            orderBy: { createdAt: 'desc' },
            take: 20,
          },
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

      const summary = await transaction.memorySummary.findUnique({
        where: { sessionId },
      });
      if (summary) {
        await transaction.memorySummary.update({
          where: { id: summary.id },
          data: {
            status: ArtifactStatus.PENDING,
            summaryText: null,
            decisions: [],
            actionItems: [],
            citations: [],
            completedAt: null,
            failureCode: null,
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
            transcriptVersion: updated.version,
          },
        });
      }

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

  async updateSummary(
    principal: Principal,
    sessionId: string,
    expectedVersion: number,
    body: UpdateMemorySummaryDto,
  ) {
    this.assertHost(principal);
    const result = await this.database.run(principal, async (transaction) => {
      const summary = await transaction.memorySummary.findUnique({
        where: { sessionId },
      });
      if (!summary) throw new NotFoundException('Memory summary not found');
      if (summary.status !== ArtifactStatus.READY) {
        throw new ConflictException('Only ready summaries can be edited');
      }
      if (summary.version !== expectedVersion) {
        throw new ConflictException(
          `Summary version mismatch. Current version is ${summary.version}`,
        );
      }

      const updated = await transaction.memorySummary.update({
        where: { id: summary.id },
        data: {
          summaryText: body.summaryText.trim(),
          ...(body.decisions
            ? { decisions: body.decisions as Prisma.InputJsonValue }
            : {}),
          ...(body.actionItems
            ? { actionItems: body.actionItems as Prisma.InputJsonValue }
            : {}),
          reviewedAt: null,
          reviewedByUserId: null,
          version: { increment: 1 },
        },
      });

      await this.audit.record(transaction, principal, {
        action: 'memory.summary_edited',
        resourceType: 'memory_summary',
        resourceId: summary.id,
        metadata: {
          sessionId,
          previousVersion: summary.version,
          version: updated.version,
        },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'memory_summary',
        aggregateId: summary.id,
        eventType: 'memory.summary.updated',
        payload: {
          memorySummaryId: summary.id,
          sessionId,
          version: updated.version,
        },
      });
      return updated;
    });

    this.realtime.publishSessionEvent({
      sessionId,
      eventName: 'memory.summary.updated',
      payload: {
        memorySummaryId: result.id,
        version: result.version,
      },
    });
    return result;
  }

  async approveSummary(
    principal: Principal,
    sessionId: string,
    expectedVersion: number,
  ) {
    this.assertHost(principal);
    const result = await this.database.run(principal, async (transaction) => {
      const summary = await transaction.memorySummary.findUnique({
        where: { sessionId },
      });
      if (!summary) throw new NotFoundException('Memory summary not found');
      if (summary.status !== ArtifactStatus.READY) {
        throw new ConflictException('Only ready summaries can be approved');
      }
      if (summary.version !== expectedVersion) {
        throw new ConflictException(
          `Summary version mismatch. Current version is ${summary.version}`,
        );
      }

      const updated = await transaction.memorySummary.update({
        where: { id: summary.id },
        data: {
          reviewedAt: new Date(),
          reviewedByUserId: principal.userId,
          version: { increment: 1 },
        },
      });

      await this.audit.record(transaction, principal, {
        action: 'memory.summary_approved',
        resourceType: 'memory_summary',
        resourceId: summary.id,
        metadata: {
          sessionId,
          previousVersion: summary.version,
          version: updated.version,
        },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'memory_summary',
        aggregateId: summary.id,
        eventType: 'memory.summary.approved',
        payload: {
          memorySummaryId: summary.id,
          sessionId,
          version: updated.version,
          reviewedAt: updated.reviewedAt?.toISOString(),
        },
      });
      return updated;
    });

    this.realtime.publishSessionEvent({
      sessionId,
      eventName: 'memory.summary.approved',
      payload: {
        memorySummaryId: result.id,
        version: result.version,
        reviewedAt: result.reviewedAt?.toISOString(),
      },
    });
    return result;
  }

  async generateFollowUp(principal: Principal, sessionId: string) {
    this.assertHost(principal);
    const context = await this.database.run(principal, async (transaction) => {
      const summary = await transaction.memorySummary.findUnique({
        where: { sessionId },
        include: {
          session: {
            select: {
              title: true,
              description: true,
            },
          },
        },
      });
      if (!summary) throw new NotFoundException('Memory summary not found');
      if (summary.status !== ArtifactStatus.READY || !summary.summaryText) {
        throw new ConflictException('A ready summary is required first');
      }
      if (!summary.reviewedAt) {
        throw new ConflictException(
          'Approve the meeting summary before drafting a follow-up',
        );
      }
      return summary;
    });

    const draft = await this.ai.draftFollowUp({
      title: context.session.title,
      summary: context.summaryText!,
      decisions: context.decisions as unknown as AiDecision[],
      actionItems: context.actionItems as unknown as AiActionItem[],
      ...(context.session.description
        ? { audience: context.session.description }
        : {}),
    });

    const result = await this.database.run(principal, async (transaction) => {
      const current = await transaction.memorySummary.findUnique({
        where: { sessionId },
      });
      if (!current) throw new NotFoundException('Memory summary not found');
      if (!current.reviewedAt) {
        throw new ConflictException(
          'Summary approval changed while generating the follow-up',
        );
      }

      const updated = await transaction.memorySummary.update({
        where: { id: current.id },
        data: {
          followUpDraft: {
            subject: draft.subject,
            body: draft.body,
            provider: draft.provider,
            model: draft.model,
          },
          followUpGeneratedAt: new Date(),
          followUpApprovedAt: null,
          followUpApprovedByUserId: null,
          version: { increment: 1 },
        },
      });

      await this.audit.record(transaction, principal, {
        action: 'memory.follow_up_generated',
        resourceType: 'memory_summary',
        resourceId: current.id,
        metadata: {
          sessionId,
          provider: draft.provider,
          model: draft.model,
          version: updated.version,
        },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'memory_summary',
        aggregateId: current.id,
        eventType: 'memory.follow_up.generated',
        payload: {
          memorySummaryId: current.id,
          sessionId,
          version: updated.version,
          provider: draft.provider,
          model: draft.model,
        },
      });
      return updated;
    });

    this.realtime.publishSessionEvent({
      sessionId,
      eventName: 'memory.follow_up.generated',
      payload: {
        memorySummaryId: result.id,
        version: result.version,
      },
    });
    return result;
  }

  async updateFollowUp(
    principal: Principal,
    sessionId: string,
    expectedVersion: number,
    body: UpdateFollowUpDraftDto,
  ) {
    this.assertHost(principal);
    const result = await this.database.run(principal, async (transaction) => {
      const summary = await transaction.memorySummary.findUnique({
        where: { sessionId },
      });
      if (!summary) throw new NotFoundException('Memory summary not found');
      if (!summary.followUpGeneratedAt) {
        throw new ConflictException('Generate a follow-up draft first');
      }
      if (summary.version !== expectedVersion) {
        throw new ConflictException(
          `Summary version mismatch. Current version is ${summary.version}`,
        );
      }

      const previous =
        summary.followUpDraft &&
        typeof summary.followUpDraft === 'object' &&
        !Array.isArray(summary.followUpDraft)
          ? (summary.followUpDraft as Record<string, unknown>)
          : {};

      const updated = await transaction.memorySummary.update({
        where: { id: summary.id },
        data: {
          followUpDraft: {
            ...previous,
            subject: body.subject.trim(),
            body: body.body.trim(),
          },
          followUpApprovedAt: null,
          followUpApprovedByUserId: null,
          version: { increment: 1 },
        },
      });

      await this.audit.record(transaction, principal, {
        action: 'memory.follow_up_edited',
        resourceType: 'memory_summary',
        resourceId: summary.id,
        metadata: {
          sessionId,
          previousVersion: summary.version,
          version: updated.version,
        },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'memory_summary',
        aggregateId: summary.id,
        eventType: 'memory.follow_up.updated',
        payload: {
          memorySummaryId: summary.id,
          sessionId,
          version: updated.version,
        },
      });
      return updated;
    });

    this.realtime.publishSessionEvent({
      sessionId,
      eventName: 'memory.follow_up.updated',
      payload: {
        memorySummaryId: result.id,
        version: result.version,
      },
    });
    return result;
  }

  async approveFollowUp(
    principal: Principal,
    sessionId: string,
    expectedVersion: number,
  ) {
    this.assertHost(principal);
    const result = await this.database.run(principal, async (transaction) => {
      const summary = await transaction.memorySummary.findUnique({
        where: { sessionId },
      });
      if (!summary) throw new NotFoundException('Memory summary not found');
      if (!summary.followUpGeneratedAt) {
        throw new ConflictException('Generate a follow-up draft first');
      }
      if (summary.version !== expectedVersion) {
        throw new ConflictException(
          `Summary version mismatch. Current version is ${summary.version}`,
        );
      }

      const updated = await transaction.memorySummary.update({
        where: { id: summary.id },
        data: {
          followUpApprovedAt: new Date(),
          followUpApprovedByUserId: principal.userId,
          version: { increment: 1 },
        },
      });

      await this.audit.record(transaction, principal, {
        action: 'memory.follow_up_approved',
        resourceType: 'memory_summary',
        resourceId: summary.id,
        metadata: {
          sessionId,
          previousVersion: summary.version,
          version: updated.version,
        },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'memory_summary',
        aggregateId: summary.id,
        eventType: 'memory.follow_up.approved',
        payload: {
          memorySummaryId: summary.id,
          sessionId,
          version: updated.version,
          approvedAt: updated.followUpApprovedAt?.toISOString(),
        },
      });
      return updated;
    });

    this.realtime.publishSessionEvent({
      sessionId,
      eventName: 'memory.follow_up.approved',
      payload: {
        memorySummaryId: result.id,
        version: result.version,
        approvedAt: result.followUpApprovedAt?.toISOString(),
      },
    });
    return result;
  }

  async sendFollowUp(
    principal: Principal,
    sessionId: string,
    body: SendFollowUpDto,
  ) {
    this.assertHost(principal);
    const result = await this.database.run(principal, async (transaction) => {
      const summary = await transaction.memorySummary.findUnique({
        where: { sessionId },
      });
      if (!summary) throw new NotFoundException('Memory summary not found');
      if (!summary.followUpGeneratedAt || !summary.followUpApprovedAt) {
        throw new ConflictException(
          'Approve the follow-up draft before requesting delivery',
        );
      }

      const draft =
        summary.followUpDraft &&
        typeof summary.followUpDraft === 'object' &&
        !Array.isArray(summary.followUpDraft)
          ? (summary.followUpDraft as Record<string, unknown>)
          : {};
      const subject =
        typeof draft.subject === 'string' ? draft.subject.trim() : '';
      const text = typeof draft.body === 'string' ? draft.body.trim() : '';
      if (!subject || !text) {
        throw new ConflictException('Approved follow-up draft is incomplete');
      }

      const recipients = [...new Set(body.recipients.map((item) => item.toLowerCase()))];

      const delivery = await transaction.emailDelivery.create({
        data: {
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          sessionId,
          memorySummaryId: summary.id,
          requestedByUserId: principal.userId,
          recipients,
          subject,
          body: text,
        },
      });

      await this.audit.record(transaction, principal, {
        action: 'memory.follow_up_send_requested',
        resourceType: 'email_delivery',
        resourceId: delivery.id,
        metadata: {
          sessionId,
          memorySummaryId: summary.id,
          recipientCount: recipients.length,
        },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'email_delivery',
        aggregateId: delivery.id,
        eventType: 'email.delivery.requested',
        payload: {
          emailDeliveryId: delivery.id,
          memorySummaryId: summary.id,
          sessionId,
          recipientCount: recipients.length,
        },
      });
      return delivery;
    });

    this.realtime.publishSessionEvent({
      sessionId,
      eventName: 'memory.follow_up.delivery_requested',
      payload: {
        emailDeliveryId: result.id,
        status: result.status,
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
