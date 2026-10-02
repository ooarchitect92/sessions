import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ArtifactStatus,
  RecordingConsentDecision,
  type Session,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { HOST_ROLES, hasAnyRole, type Principal } from '../common/auth/principal';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { OutboxService } from '../outbox/outbox.service';
import { RecordConsentDto } from './dto/record-consent.dto';
import { UpdateRecordingRetentionDto } from './dto/update-retention.dto';
import { S3ObjectStoreService } from './s3-object-store.service';

@Injectable()
export class RecordingsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly config: ConfigService,
    private readonly objectStore: S3ObjectStoreService,
  ) {}

  async getConsentStatus(principal: Principal, sessionId: string) {
    return this.database.run(principal, async (transaction) => {
      const session = await transaction.session.findUnique({ where: { id: sessionId } });
      if (!session) throw new NotFoundException('Session not found');

      const [current, grouped] = await Promise.all([
        transaction.recordingConsent.findUnique({
          where: {
            sessionId_userId: {
              sessionId,
              userId: principal.userId,
            },
          },
        }),
        transaction.recordingConsent.groupBy({
          by: ['decision'],
          where: { sessionId },
          _count: { _all: true },
        }),
      ]);
      const count = (decision: RecordingConsentDecision) =>
        grouped.find((entry) => entry.decision === decision)?._count._all ?? 0;

      return {
        sessionId,
        required: session.recordingEnabled,
        currentDecision: current?.decision ?? null,
        policyVersion:
          current?.policyVersion ??
          this.config.get<string>('RECORDING_POLICY_VERSION', 'recording-policy-v1'),
        noticeVersion:
          current?.noticeVersion ??
          this.config.get<string>('RECORDING_NOTICE_VERSION', 'recording-notice-v1'),
        counts: {
          granted: count(RecordingConsentDecision.GRANTED),
          declined: count(RecordingConsentDecision.DECLINED),
          revoked: count(RecordingConsentDecision.REVOKED),
        },
        updatedAt: current?.updatedAt ?? null,
      };
    });
  }

  async recordConsent(
    principal: Principal,
    sessionId: string,
    input: RecordConsentDto,
  ) {
    const result = await this.database.run(principal, async (transaction) => {
      const session = await transaction.session.findUnique({ where: { id: sessionId } });
      if (!session) throw new NotFoundException('Session not found');
      if (!session.recordingEnabled) {
        throw new ConflictException('Recording is not enabled for this session');
      }

      const now = new Date();
      const consent = await transaction.recordingConsent.upsert({
        where: {
          sessionId_userId: {
            sessionId,
            userId: principal.userId,
          },
        },
        update: {
          decision: input.decision,
          policyVersion: input.policyVersion,
          noticeVersion: input.noticeVersion,
          grantedAt: input.decision === RecordingConsentDecision.GRANTED ? now : null,
          revokedAt: input.decision === RecordingConsentDecision.REVOKED ? now : null,
        },
        create: {
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          sessionId,
          userId: principal.userId,
          decision: input.decision,
          policyVersion: input.policyVersion,
          noticeVersion: input.noticeVersion,
          grantedAt: input.decision === RecordingConsentDecision.GRANTED ? now : null,
          revokedAt: input.decision === RecordingConsentDecision.REVOKED ? now : null,
        },
      });

      await this.audit.record(transaction, principal, {
        action: `recording.consent.${input.decision.toLowerCase()}`,
        resourceType: 'session',
        resourceId: sessionId,
        metadata: {
          consentId: consent.id,
          policyVersion: input.policyVersion,
          noticeVersion: input.noticeVersion,
        },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'recording_consent',
        aggregateId: consent.id,
        eventType: 'recording.consent.updated',
        payload: {
          consentId: consent.id,
          sessionId,
          userId: principal.userId,
          decision: consent.decision,
          policyVersion: consent.policyVersion,
          noticeVersion: consent.noticeVersion,
          updatedAt: consent.updatedAt.toISOString(),
        },
      });
      return consent;
    });
    return {
      sessionId,
      decision: result.decision,
      policyVersion: result.policyVersion,
      noticeVersion: result.noticeVersion,
      updatedAt: result.updatedAt,
    };
  }

  async assertConsentAndPrepare(
    principal: Principal,
    session: Pick<Session, 'id' | 'recordingEnabled' | 'organizationId' | 'workspaceId'>,
  ): Promise<void> {
    if (!session.recordingEnabled) return;

    await this.database.run(principal, async (transaction) => {
      const consent = await transaction.recordingConsent.findUnique({
        where: {
          sessionId_userId: {
            sessionId: session.id,
            userId: principal.userId,
          },
        },
      });
      if (consent?.decision !== RecordingConsentDecision.GRANTED) {
        throw new ForbiddenException(
          'Recording consent is required before joining this session',
        );
      }

      const lockKey = `recording:${session.id}`;
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
      const existing = await transaction.recording.findUnique({
        where: { sessionId: session.id },
      });
      if (existing) return;

      const grouped = await transaction.recordingConsent.groupBy({
        by: ['decision'],
        where: { sessionId: session.id },
        _count: { _all: true },
      });
      const count = (decision: RecordingConsentDecision) =>
        grouped.find((entry) => entry.decision === decision)?._count._all ?? 0;
      const retentionDays = this.config.get<number>('RECORDING_RETENTION_DAYS', 30);
      const recording = await transaction.recording.create({
        data: {
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          sessionId: session.id,
          retentionUntil: new Date(Date.now() + retentionDays * 24 * 60 * 60_000),
          consentSnapshot: {
            required: true,
            policyVersion: consent.policyVersion,
            noticeVersion: consent.noticeVersion,
            capturedAt: new Date().toISOString(),
            counts: {
              granted: count(RecordingConsentDecision.GRANTED),
              declined: count(RecordingConsentDecision.DECLINED),
              revoked: count(RecordingConsentDecision.REVOKED),
            },
          },
        },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'recording',
        aggregateId: recording.id,
        eventType: 'recording.start.requested',
        payload: { recordingId: recording.id, sessionId: session.id },
      });
    });
  }

  async createPlaybackGrant(
    principal: Principal,
    sessionId: string,
    disposition: 'inline' | 'attachment',
  ) {
    return this.database.run(principal, async (transaction) => {
      const recording = await transaction.recording.findUnique({
        where: { sessionId },
        include: { session: { select: { title: true } } },
      });
      if (!recording) throw new NotFoundException('Recording not found');
      if (recording.status !== ArtifactStatus.READY || !recording.playbackObjectKey) {
        throw new ConflictException('Recording playback is not ready');
      }
      if (recording.retentionUntil && recording.retentionUntil.getTime() <= Date.now()) {
        throw new ConflictException('Recording retention has expired');
      }
      const ttlSeconds = this.config.get<number>('RECORDING_PLAYBACK_TTL_SECONDS', 300);
      const filename = `${recording.session.title}.mp4`;
      const url =
        disposition === 'attachment'
          ? this.objectStore.createAttachmentUrl(
              recording.playbackObjectKey,
              filename,
              ttlSeconds,
            )
          : this.objectStore.createDownloadUrl(
              recording.playbackObjectKey,
              filename,
              ttlSeconds,
            );

      await this.audit.record(transaction, principal, {
        action:
          disposition === 'attachment'
            ? 'recording.download_granted'
            : 'recording.playback_granted',
        resourceType: 'recording',
        resourceId: recording.id,
        metadata: {
          sessionId,
          expiresInSeconds: ttlSeconds,
          disposition,
        },
      });
      return {
        recordingId: recording.id,
        sessionId,
        url,
        disposition,
        expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
        mimeType: recording.mimeType ?? 'video/mp4',
      };
    });
  }

  async updateRetention(
    principal: Principal,
    sessionId: string,
    input: UpdateRecordingRetentionDto,
  ) {
    this.assertHost(principal);
    return this.database.run(principal, async (transaction) => {
      const recording = await transaction.recording.findUnique({
        where: { sessionId },
      });
      if (!recording) throw new NotFoundException('Recording not found');
      if (recording.status === ArtifactStatus.DELETED) {
        throw new ConflictException('A deleted recording cannot be retained');
      }
      if (recording.status === ArtifactStatus.DELETING) {
        throw new ConflictException('Recording deletion is already in progress');
      }

      const retentionUntil =
        input.retentionUntil === null || input.retentionUntil === undefined
          ? null
          : new Date(input.retentionUntil);
      const expired = retentionUntil !== null && retentionUntil.getTime() <= Date.now();
      const updated = await transaction.recording.update({
        where: { id: recording.id },
        data: {
          retentionUntil,
          ...(expired
            ? {
                status: ArtifactStatus.DELETING,
                deletionRequestedAt: new Date(),
              }
            : {}),
          version: { increment: 1 },
        },
      });
      await this.audit.record(transaction, principal, {
        action: 'recording.retention_updated',
        resourceType: 'recording',
        resourceId: recording.id,
        metadata: {
          sessionId,
          retentionUntil: retentionUntil?.toISOString() ?? null,
          deletionScheduled: expired,
        },
      });
      return updated;
    });
  }

  async requestDeletion(principal: Principal, sessionId: string) {
    this.assertHost(principal);
    return this.database.run(principal, async (transaction) => {
      const recording = await transaction.recording.findUnique({
        where: { sessionId },
      });
      if (!recording) throw new NotFoundException('Recording not found');
      if (recording.status === ArtifactStatus.DELETED) {
        return { recordingId: recording.id, sessionId, accepted: true };
      }
      if (recording.status === ArtifactStatus.PROCESSING) {
        throw new ConflictException(
          'End the session and wait for recording finalization before deletion',
        );
      }

      await transaction.recording.update({
        where: { id: recording.id },
        data: {
          status: ArtifactStatus.DELETING,
          deletionRequestedAt: new Date(),
          version: { increment: 1 },
        },
      });
      await this.audit.record(transaction, principal, {
        action: 'recording.deletion_requested',
        resourceType: 'recording',
        resourceId: recording.id,
        metadata: { sessionId },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'recording',
        aggregateId: recording.id,
        eventType: 'recording.delete.requested',
        payload: { recordingId: recording.id, sessionId },
      });
      return { recordingId: recording.id, sessionId, accepted: true };
    });
  }

  private assertHost(principal: Principal): void {
    if (!hasAnyRole(principal, HOST_ROLES)) {
      throw new ForbiddenException('A host role is required');
    }
  }
}
