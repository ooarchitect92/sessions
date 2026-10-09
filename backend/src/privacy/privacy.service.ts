import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserStatus, WorkspaceRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import type { Principal } from '../common/auth/principal';
import { WorkerPrismaService } from '../database/worker-prisma.service';
import { OutboxService } from '../outbox/outbox.service';

@Injectable()
export class PrivacyService {
  constructor(
    private readonly prisma: WorkerPrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async exportMyData(principal: Principal) {
    const user = await this.prisma.user.findUnique({
      where: { id: principal.userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        status: true,
        emailVerifiedAt: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) throw new NotFoundException('The account is unavailable');

    const [
      memberships,
      createdSessions,
      createdEvents,
      createdBookingPages,
      authoredChat,
      submittedQuestions,
      recordingConsents,
      attendance,
      engagement,
      calendarConnections,
      transcriptRevisions,
      loginSessions,
    ] = await Promise.all([
      this.prisma.workspaceMembership.findMany({
        where: { userId: principal.userId },
        include: { workspace: { include: { organization: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.session.findMany({
        where: { createdById: principal.userId },
        select: { id: true, workspaceId: true, title: true, status: true, startsAt: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.event.findMany({
        where: { createdById: principal.userId },
        select: { id: true, workspaceId: true, title: true, status: true, startsAt: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.bookingPage.findMany({
        where: { createdById: principal.userId },
        select: { id: true, workspaceId: true, title: true, slug: true, active: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.chatMessage.findMany({
        where: { authorUserId: principal.userId },
        select: { id: true, workspaceId: true, sessionId: true, channel: true, body: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.question.findMany({
        where: { authorUserId: principal.userId },
        select: { id: true, workspaceId: true, sessionId: true, body: true, status: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.recordingConsent.findMany({
        where: { userId: principal.userId },
        select: { sessionId: true, decision: true, policyVersion: true, noticeVersion: true, createdAt: true, updatedAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.attendanceInterval.findMany({
        where: { userId: principal.userId },
        select: { sessionId: true, joinedAt: true, leftAt: true, createdAt: true },
        orderBy: { joinedAt: 'asc' },
      }),
      this.prisma.engagementEvent.findMany({
        where: { userId: principal.userId },
        select: { sessionId: true, kind: true, occurredAt: true, metadata: true },
        orderBy: { occurredAt: 'asc' },
      }),
      this.prisma.calendarConnection.findMany({
        where: { userId: principal.userId },
        select: { id: true, workspaceId: true, provider: true, status: true, calendarId: true, syncEnabled: true, createdAt: true, updatedAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.transcriptRevision.findMany({
        where: { editorUserId: principal.userId },
        select: { id: true, transcriptId: true, revisionNumber: true, language: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.authSession.findMany({
        where: { userId: principal.userId },
        select: { id: true, workspaceId: true, userAgent: true, identityProvider: true, createdAt: true, lastUsedAt: true, expiresAt: true, revokedAt: true, revokedReason: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const requestId = randomUUID();
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`
        INSERT INTO privacy_requests (id, organization_id, workspace_id, user_id, type, status, metadata, completed_at)
        VALUES (
          ${requestId}::uuid, ${principal.organizationId}::uuid, ${principal.workspaceId}::uuid,
          ${principal.userId}::uuid, 'EXPORT', 'COMPLETED',
          ${JSON.stringify({ format: 'json', generatedAt: new Date().toISOString() })}::jsonb, NOW()
        )
      `;
      await this.audit.record(transaction, principal, {
        action: 'privacy.export.completed',
        resourceType: 'privacy_request',
        resourceId: requestId,
        metadata: { format: 'json' },
      });
    });

    return {
      requestId,
      exportedAt: new Date().toISOString(),
      formatVersion: 1,
      profile: user,
      memberships: memberships.map((membership) => ({
        id: membership.id,
        role: membership.role,
        createdAt: membership.createdAt,
        workspace: {
          id: membership.workspace.id,
          name: membership.workspace.name,
          slug: membership.workspace.slug,
          organization: {
            id: membership.workspace.organization.id,
            name: membership.workspace.organization.name,
            slug: membership.workspace.organization.slug,
          },
        },
      })),
      authoredContent: {
        sessions: createdSessions,
        events: createdEvents,
        bookingPages: createdBookingPages,
        chatMessages: authoredChat,
        questions: submittedQuestions,
        transcriptRevisions,
      },
      activity: {
        recordingConsents,
        attendance,
        engagement,
        loginSessions,
      },
      integrations: { calendarConnections },
    };
  }

  async eraseMyAccount(principal: Principal) {
    const user = await this.prisma.user.findUnique({
      where: { id: principal.userId },
      select: { id: true, status: true },
    });
    if (!user) throw new NotFoundException('The account is unavailable');
    if (user.status === UserStatus.DELETED) return { erased: true };

    const ownerMemberships = await this.prisma.workspaceMembership.findMany({
      where: { userId: principal.userId, role: WorkspaceRole.OWNER },
      select: { id: true, workspaceId: true, workspace: { select: { name: true } } },
    });
    for (const membership of ownerMemberships) {
      const otherOwners = await this.prisma.workspaceMembership.count({
        where: {
          workspaceId: membership.workspaceId,
          role: WorkspaceRole.OWNER,
          userId: { not: principal.userId },
        },
      });
      if (otherOwners === 0) {
        throw new ConflictException(
          `Transfer ownership of workspace "${membership.workspace.name}" before erasing this account`,
        );
      }
    }

    const requestId = randomUUID();
    const pseudonymousEmail = `deleted+${principal.userId}@privacy.invalid`;
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`
        INSERT INTO privacy_requests (id, organization_id, workspace_id, user_id, type, status, metadata)
        VALUES (
          ${requestId}::uuid, ${principal.organizationId}::uuid, ${principal.workspaceId}::uuid,
          ${principal.userId}::uuid, 'ERASURE', 'PROCESSING',
          ${JSON.stringify({ strategy: 'irreversible_pseudonymization', requestedAt: new Date().toISOString() })}::jsonb
        )
      `;
      await this.audit.record(transaction, principal, {
        action: 'privacy.erasure.requested',
        resourceType: 'privacy_request',
        resourceId: requestId,
      });

      await transaction.authSession.updateMany({
        where: { userId: principal.userId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'privacy_erasure' },
      });
      await transaction.authChallenge.deleteMany({ where: { userId: principal.userId } });
      await transaction.userMfaFactor.deleteMany({ where: { userId: principal.userId } });
      await transaction.emailVerificationToken.deleteMany({ where: { userId: principal.userId } });
      await transaction.passwordResetToken.deleteMany({ where: { userId: principal.userId } });
      await transaction.calendarOAuthState.deleteMany({ where: { userId: principal.userId } });
      await transaction.calendarConnection.deleteMany({ where: { userId: principal.userId } });
      await transaction.recordingConsent.deleteMany({ where: { userId: principal.userId } });
      await transaction.attendanceInterval.deleteMany({ where: { userId: principal.userId } });
      await transaction.engagementEvent.deleteMany({ where: { userId: principal.userId } });
      await transaction.chatReaction.deleteMany({ where: { userId: principal.userId } });
      await transaction.breakoutAssignment.deleteMany({ where: { userId: principal.userId } });
      await transaction.question.updateMany({
        where: { authorUserId: principal.userId },
        data: { authorUserId: null },
      });
      await transaction.aiExternalAction.updateMany({
        where: { approvedById: principal.userId },
        data: { approvedById: null },
      });
      await transaction.workspaceInvitation.updateMany({
        where: { acceptedById: principal.userId },
        data: { acceptedById: null },
      });

      await transaction.$executeRaw`DELETE FROM scim_external_identities WHERE user_id = ${principal.userId}::uuid`;
      await transaction.$executeRaw`DELETE FROM enterprise_oidc_identities WHERE user_id = ${principal.userId}::uuid`;
      await transaction.$executeRaw`DELETE FROM oidc_login_grants WHERE user_id = ${principal.userId}::uuid`;

      await transaction.workspaceMembership.deleteMany({ where: { userId: principal.userId } });
      await transaction.user.update({
        where: { id: principal.userId },
        data: {
          email: pseudonymousEmail,
          displayName: 'Deleted user',
          avatarUrl: null,
          passwordHash: null,
          status: UserStatus.DELETED,
          emailVerifiedAt: null,
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: null,
        },
      });

      await transaction.$executeRaw`
        UPDATE privacy_requests
        SET status = 'COMPLETED', completed_at = NOW(),
            metadata = metadata || ${JSON.stringify({ completed: true })}::jsonb
        WHERE id = ${requestId}::uuid
      `;
      await this.outbox.enqueue(
        transaction,
        { organizationId: principal.organizationId, workspaceId: principal.workspaceId },
        {
          aggregateType: 'privacy_request',
          aggregateId: requestId,
          eventType: 'privacy.erasure.completed',
          payload: { requestId, userId: principal.userId } as Prisma.InputJsonObject,
        },
      );
    });

    return {
      requestId,
      erased: true,
      strategy: 'irreversible_pseudonymization',
      signedOut: true,
    };
  }
}
