import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ArtifactStatus, Prisma } from '@prisma/client';
import { WorkerPrismaService } from '../database/worker-prisma.service';
import { OutboxService } from '../outbox/outbox.service';

type RetentionPolicyRow = {
  organization_id: string;
  workspace_id: string;
  transcript_days: number;
  audit_days: number;
  delete_on_expiry: boolean;
  legal_hold: boolean;
};

@Injectable()
export class GovernanceLifecycleWorker {
  private readonly logger = new Logger(GovernanceLifecycleWorker.name);
  private running = false;

  constructor(
    private readonly prisma: WorkerPrismaService,
    private readonly outbox: OutboxService,
  ) {}

  @Interval(5 * 60_000)
  async runCycle(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const policies = await this.prisma.$queryRaw<RetentionPolicyRow[]>`
        SELECT organization_id, workspace_id, transcript_days, audit_days, delete_on_expiry, legal_hold
        FROM workspace_retention_policies
        WHERE delete_on_expiry = TRUE
          AND legal_hold = FALSE
        ORDER BY updated_at ASC
        LIMIT 250
      `;
      for (const policy of policies) {
        await this.applyTranscriptRetention(policy);
        await this.applyAuditRetention(policy);
      }
    } catch (error: unknown) {
      this.logger.error(
        'Governance lifecycle worker cycle failed',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
  }

  private async applyTranscriptRetention(policy: RetentionPolicyRow): Promise<void> {
    const cutoff = new Date(Date.now() - policy.transcript_days * 24 * 60 * 60_000);
    const transcripts = await this.prisma.transcript.findMany({
      where: {
        organizationId: policy.organization_id,
        workspaceId: policy.workspace_id,
        status: { notIn: [ArtifactStatus.DELETING, ArtifactStatus.DELETED] },
        OR: [
          { completedAt: { lte: cutoff } },
          { completedAt: null, createdAt: { lte: cutoff } },
        ],
      },
      select: {
        id: true,
        sessionId: true,
        organizationId: true,
        workspaceId: true,
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    for (const transcript of transcripts) {
      const claimed = await this.prisma.transcript.updateMany({
        where: {
          id: transcript.id,
          status: { notIn: [ArtifactStatus.DELETING, ArtifactStatus.DELETED] },
          OR: [
            { completedAt: { lte: cutoff } },
            { completedAt: null, createdAt: { lte: cutoff } },
          ],
        },
        data: {
          status: ArtifactStatus.DELETING,
          version: { increment: 1 },
        },
      });
      if (claimed.count === 0) continue;

      try {
        await this.prisma.$transaction(async (transaction) => {
          await transaction.transcriptSegment.deleteMany({
            where: { transcriptId: transcript.id },
          });
          await transaction.transcriptRevision.deleteMany({
            where: { transcriptId: transcript.id },
          });
          await transaction.transcript.update({
            where: { id: transcript.id },
            data: {
              status: ArtifactStatus.DELETED,
              fullText: null,
              objectKey: null,
              failureCode: null,
              version: { increment: 1 },
            },
          });
          await this.outbox.enqueue(
            transaction,
            {
              organizationId: transcript.organizationId,
              workspaceId: transcript.workspaceId,
            },
            {
              aggregateType: 'transcript',
              aggregateId: transcript.id,
              eventType: 'transcript.retention_deleted',
              payload: {
                transcriptId: transcript.id,
                sessionId: transcript.sessionId,
                retentionCutoff: cutoff.toISOString(),
              } as Prisma.InputJsonObject,
            },
          );
        });
      } catch (error: unknown) {
        await this.prisma.transcript.updateMany({
          where: { id: transcript.id, status: ArtifactStatus.DELETING },
          data: {
            status: ArtifactStatus.FAILED,
            failureCode: `retention_delete_failed:${this.message(error)}`.slice(0, 160),
            version: { increment: 1 },
          },
        });
        this.logger.warn(
          `Unable to apply transcript retention to ${transcript.id}: ${this.message(error)}`,
        );
      }
    }
  }

  private async applyAuditRetention(policy: RetentionPolicyRow): Promise<void> {
    const cutoff = new Date(Date.now() - policy.audit_days * 24 * 60 * 60_000);
    const deleted = await this.prisma.$executeRaw`
      DELETE FROM audit_events
      WHERE id IN (
        SELECT id
        FROM audit_events
        WHERE organization_id = ${policy.organization_id}::uuid
          AND workspace_id = ${policy.workspace_id}::uuid
          AND created_at < ${cutoff}
        ORDER BY created_at ASC
        LIMIT 1000
      )
    `;
    if (deleted > 0) {
      this.logger.log(
        `Deleted ${deleted} expired audit events for workspace ${policy.workspace_id}`,
      );
    }
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message.slice(0, 120) : 'unknown';
  }
}
