import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { ADMIN_ROLES, hasAnyRole, type Principal } from '../common/auth/principal';
import { TenantDatabaseService } from '../database/tenant-database.service';

type GovernanceClient = Prisma.TransactionClient;
type RetentionPolicyRow = {
  id: string;
  recording_days: number;
  transcript_days: number;
  audit_days: number;
  delete_on_expiry: boolean;
  legal_hold: boolean;
  created_at: Date;
  updated_at: Date;
};

export interface UpdateRetentionPolicyInput {
  recordingDays: number;
  transcriptDays: number;
  auditDays: number;
  deleteOnExpiry: boolean;
  legalHold: boolean;
}

@Injectable()
export class GovernanceService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
  ) {}

  async getRetentionPolicy(principal: Principal) {
    this.assertAdmin(principal);
    return this.database.run(principal, async (transaction) =>
      this.retentionPolicy(transaction, principal),
    );
  }

  async updateRetentionPolicy(
    principal: Principal,
    input: UpdateRetentionPolicyInput,
  ) {
    this.assertAdmin(principal);
    this.validateRetention(input);
    return this.database.run(principal, async (transaction) => {
      const rows = await transaction.$queryRaw<RetentionPolicyRow[]>`
        INSERT INTO workspace_retention_policies (
          organization_id, workspace_id, recording_days, transcript_days, audit_days, delete_on_expiry, legal_hold
        ) VALUES (
          ${principal.organizationId}::uuid, ${principal.workspaceId}::uuid,
          ${input.recordingDays}, ${input.transcriptDays}, ${input.auditDays},
          ${input.deleteOnExpiry}, ${input.legalHold}
        )
        ON CONFLICT (workspace_id) DO UPDATE SET
          recording_days = EXCLUDED.recording_days,
          transcript_days = EXCLUDED.transcript_days,
          audit_days = EXCLUDED.audit_days,
          delete_on_expiry = EXCLUDED.delete_on_expiry,
          legal_hold = EXCLUDED.legal_hold,
          updated_at = NOW()
        RETURNING *
      `;
      const saved = rows[0];
      if (!saved) throw new Error('workspace_retention_policy_invariant');
      await this.audit.record(transaction, principal, {
        action: 'governance.retention_policy.updated',
        resourceType: 'workspace',
        resourceId: principal.workspaceId,
        metadata: {
          recordingDays: saved.recording_days,
          transcriptDays: saved.transcript_days,
          auditDays: saved.audit_days,
          deleteOnExpiry: saved.delete_on_expiry,
          legalHold: saved.legal_hold,
        },
      });
      return this.shapeRetention(saved);
    });
  }

  async auditExport(principal: Principal, fromInput?: string, toInput?: string) {
    this.assertAdmin(principal);
    const { from, to } = this.range(fromInput, toInput);
    return this.database.run(principal, async (transaction) => {
      const events = await transaction.auditEvent.findMany({
        where: {
          workspaceId: principal.workspaceId,
          organizationId: principal.organizationId,
          createdAt: { gte: from, lte: to },
        },
        orderBy: { createdAt: 'asc' },
        take: 10000,
      });
      await this.audit.record(transaction, principal, {
        action: 'governance.audit_exported',
        resourceType: 'workspace',
        resourceId: principal.workspaceId,
        metadata: { from: from.toISOString(), to: to.toISOString(), rowCount: events.length },
      });
      return {
        filename: `audit-${from.toISOString().slice(0,10)}-to-${to.toISOString().slice(0,10)}.csv`,
        columns: ['id','createdAt','actorUserId','action','resourceType','resourceId','metadata'],
        rows: events.map((event) => ({
          id: event.id,
          createdAt: event.createdAt.toISOString(),
          actorUserId: event.actorUserId,
          action: event.action,
          resourceType: event.resourceType,
          resourceId: event.resourceId ?? '',
          metadata: JSON.stringify(event.metadata),
        })),
        truncated: events.length >= 10000,
      };
    });
  }

  async resolveRetentionForRecording(client: GovernanceClient, principal: Principal) {
    const policy = await this.retentionPolicy(client, principal);
    if (policy.legalHold) return { retentionUntil: null as Date | null, legalHold: true };
    return {
      retentionUntil: new Date(Date.now() + policy.recordingDays * 24 * 60 * 60_000),
      legalHold: false,
    };
  }

  private async retentionPolicy(client: GovernanceClient, principal: Principal) {
    await client.$executeRaw`
      INSERT INTO workspace_retention_policies (organization_id, workspace_id)
      VALUES (${principal.organizationId}::uuid, ${principal.workspaceId}::uuid)
      ON CONFLICT (workspace_id) DO NOTHING
    `;
    const rows = await client.$queryRaw<RetentionPolicyRow[]>`
      SELECT * FROM workspace_retention_policies
      WHERE organization_id = ${principal.organizationId}::uuid
        AND workspace_id = ${principal.workspaceId}::uuid
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) throw new Error('workspace_retention_policy_invariant');
    return this.shapeRetention(row);
  }

  private shapeRetention(row: RetentionPolicyRow) {
    return {
      id: row.id,
      recordingDays: row.recording_days,
      transcriptDays: row.transcript_days,
      auditDays: row.audit_days,
      deleteOnExpiry: row.delete_on_expiry,
      legalHold: row.legal_hold,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private validateRetention(input: UpdateRetentionPolicyInput) {
    if (!Number.isInteger(input.recordingDays) || input.recordingDays < 1 || input.recordingDays > 3650)
      throw new BadRequestException('recordingDays must be an integer between 1 and 3650');
    if (!Number.isInteger(input.transcriptDays) || input.transcriptDays < 1 || input.transcriptDays > 3650)
      throw new BadRequestException('transcriptDays must be an integer between 1 and 3650');
    if (!Number.isInteger(input.auditDays) || input.auditDays < 30 || input.auditDays > 3650)
      throw new BadRequestException('auditDays must be an integer between 30 and 3650');
  }

  private range(fromInput?: string, toInput?: string) {
    const to = toInput ? new Date(toInput) : new Date();
    const from = fromInput ? new Date(fromInput) : new Date(to.getTime() - 30 * 24 * 60 * 60_000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to)
      throw new BadRequestException('Audit export date range is invalid');
    if (to.getTime() - from.getTime() > 366 * 24 * 60 * 60_000)
      throw new BadRequestException('Audit export range cannot exceed 366 days');
    return { from, to };
  }

  private assertAdmin(principal: Principal) {
    if (!hasAnyRole(principal, ADMIN_ROLES)) throw new ForbiddenException('Owner or admin role is required');
  }
}