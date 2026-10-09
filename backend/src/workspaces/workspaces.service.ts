import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  UserStatus,
  WorkspaceRole,
  type Workspace,
} from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import { AuditService } from '../audit/audit.service';
import { SecurityService } from '../auth/security.service';
import {
  ADMIN_ROLES,
  hasAnyRole,
  type Principal,
} from '../common/auth/principal';
import { WorkerPrismaService } from '../database/worker-prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';

type MembershipWithWorkspace = Prisma.WorkspaceMembershipGetPayload<{
  include: { workspace: { include: { organization: true } } };
}>;

type MemberWithUser = Prisma.WorkspaceMembershipGetPayload<{
  include: { user: { include: { mfaFactor: true } } };
}>;

type WorkspaceMembershipClient = Pick<
  Prisma.TransactionClient,
  'workspaceMembership'
>;

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: WorkerPrismaService,
    private readonly security: SecurityService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async listAccessible(principal: Principal) {
    const memberships = await this.prisma.workspaceMembership.findMany({
      where: { userId: principal.userId },
      include: {
        workspace: {
          include: {
            organization: true,
            _count: { select: { memberships: true, sessions: true } },
          },
        },
      },
      orderBy: [{ workspace: { organization: { name: 'asc' } } }, { workspace: { name: 'asc' } }],
    });
    return memberships.map((membership) => ({
      membershipId: membership.id,
      role: membership.role,
      organization: {
        id: membership.organizationId,
        name: membership.workspace.organization.name,
        slug: membership.workspace.organization.slug,
      },
      workspace: {
        id: membership.workspace.id,
        name: membership.workspace.name,
        slug: membership.workspace.slug,
        timezone: membership.workspace.timezone,
        version: membership.workspace.version,
        memberCount: membership.workspace._count.memberships,
        sessionCount: membership.workspace._count.sessions,
      },
      current: membership.workspaceId === principal.workspaceId,
    }));
  }

  async getCurrent(principal: Principal) {
    const membership = await this.requireCurrentMembership(principal);
    const workspace = await this.prisma.workspace.findFirst({
      where: {
        id: principal.workspaceId,
        organizationId: principal.organizationId,
      },
      include: {
        organization: true,
        _count: {
          select: {
            memberships: true,
            rooms: true,
            sessions: true,
            events: true,
            bookingPages: true,
          },
        },
      },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');
    return {
      ...workspace,
      currentRole: membership.role,
    };
  }

  async create(
    principal: Principal,
    input: CreateWorkspaceDto,
    idempotencyKey: string,
  ): Promise<Workspace | Prisma.JsonObject> {
    this.assertAdmin(principal);
    this.assertTimeZone(input.timezone);
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ operation: 'workspace.create', input }))
      .digest('hex');

    return this.prisma.$transaction(async (transaction) => {
      await this.requireCurrentMembership(principal, transaction);
      const lockKey = `workspace.create:${principal.organizationId}:${idempotencyKey}`;
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
      const existingKey = await transaction.idempotencyKey.findUnique({
        where: {
          workspaceId_key: {
            workspaceId: principal.workspaceId,
            key: idempotencyKey,
          },
        },
      });
      if (existingKey) {
        if (existingKey.requestHash !== requestHash) {
          throw new ConflictException(
            'This idempotency key was already used with a different request',
          );
        }
        return existingKey.response as Prisma.JsonObject;
      }

      const conflicting = await transaction.workspace.findUnique({
        where: {
          organizationId_slug: {
            organizationId: principal.organizationId,
            slug: input.slug,
          },
        },
        select: { id: true },
      });
      if (conflicting) {
        throw new ConflictException('A workspace with this slug already exists');
      }

      const workspace = await transaction.workspace.create({
        data: {
          organizationId: principal.organizationId,
          name: input.name.trim(),
          slug: input.slug,
          timezone: input.timezone,
          settings: {
            recordingConsentRequired: true,
            authPolicy: { mfaRecommended: true },
          },
        },
      });
      const membership = await transaction.workspaceMembership.create({
        data: {
          organizationId: principal.organizationId,
          workspaceId: workspace.id,
          userId: principal.userId,
          role: WorkspaceRole.OWNER,
        },
      });
      const newPrincipal: Principal = {
        ...principal,
        workspaceId: workspace.id,
        roles: [membership.role],
      };
      await this.audit.record(transaction, newPrincipal, {
        action: 'workspace.created',
        resourceType: 'workspace',
        resourceId: workspace.id,
        metadata: { slug: workspace.slug, sourceWorkspaceId: principal.workspaceId },
      });
      await this.outbox.enqueue(transaction, newPrincipal, {
        aggregateType: 'workspace',
        aggregateId: workspace.id,
        eventType: 'workspace.created',
        payload: this.toJson(workspace),
      });
      const response = this.toJson(workspace);
      await transaction.idempotencyKey.create({
        data: {
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          key: idempotencyKey,
          requestHash,
          response,
          statusCode: 201,
          expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
        },
      });
      return workspace;
    });
  }

  async updateCurrent(
    principal: Principal,
    expectedVersion: number,
    input: UpdateWorkspaceDto,
  ): Promise<Workspace> {
    this.assertAdmin(principal);
    if (Object.keys(input).length === 0) {
      throw new BadRequestException('At least one workspace field must be supplied');
    }
    if (input.timezone !== undefined) this.assertTimeZone(input.timezone);

    return this.prisma.$transaction(async (transaction) => {
      await this.requireCurrentMembership(principal, transaction);
      const current = await transaction.workspace.findFirst({
        where: {
          id: principal.workspaceId,
          organizationId: principal.organizationId,
        },
      });
      if (!current) throw new NotFoundException('Workspace not found');
      if (current.version !== expectedVersion) {
        throw new ConflictException(
          `Version conflict. Current version is ${current.version}`,
        );
      }
      if (input.slug !== undefined) {
        const conflicting = await transaction.workspace.findFirst({
          where: {
            organizationId: principal.organizationId,
            slug: input.slug,
            id: { not: principal.workspaceId },
          },
          select: { id: true },
        });
        if (conflicting) {
          throw new ConflictException('A workspace with this slug already exists');
        }
      }

      const currentSettings = this.jsonObject(current.settings);
      const workspace = await transaction.workspace.update({
        where: { id: principal.workspaceId },
        data: {
          version: { increment: 1 },
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.slug !== undefined ? { slug: input.slug } : {}),
          ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
          ...(input.settings !== undefined
            ? {
                settings: {
                  ...currentSettings,
                  ...input.settings,
                } as Prisma.InputJsonValue,
              }
            : {}),
        },
      });
      await this.audit.record(transaction, principal, {
        action: 'workspace.updated',
        resourceType: 'workspace',
        resourceId: workspace.id,
        metadata: { previousVersion: expectedVersion, version: workspace.version },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'workspace',
        aggregateId: workspace.id,
        eventType: 'workspace.updated',
        payload: this.toJson(workspace),
      });
      return workspace;
    });
  }

  async listDomains(principal: Principal) {
    await this.requireCurrentMembership(principal);
    return this.prisma.workspaceDomain.findMany({
      where: {
        organizationId: principal.organizationId,
        workspaceId: principal.workspaceId,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createDomain(principal: Principal, hostnameValue: string) {
    this.assertAdmin(principal);
    const hostname = hostnameValue.trim().toLowerCase();
    const verificationToken = randomBytes(24).toString('base64url');

    return this.prisma.$transaction(async (transaction) => {
      await this.requireCurrentMembership(principal, transaction);
      const existing = await transaction.workspaceDomain.findUnique({
        where: { hostname },
        select: { id: true, workspaceId: true },
      });
      if (existing) {
        throw new ConflictException(
          existing.workspaceId === principal.workspaceId
            ? 'This domain is already attached to the workspace'
            : 'This domain is already claimed by another workspace',
        );
      }

      const domain = await transaction.workspaceDomain.create({
        data: {
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          hostname,
          verificationToken,
        },
      });
      await this.audit.record(transaction, principal, {
        action: 'workspace.domain.created',
        resourceType: 'workspace_domain',
        resourceId: domain.id,
        metadata: { hostname },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'workspace_domain',
        aggregateId: domain.id,
        eventType: 'workspace.domain.created',
        payload: {
          id: domain.id,
          hostname: domain.hostname,
          status: domain.status,
        },
      });
      return domain;
    });
  }

  async verifyDomain(principal: Principal, domainId: string) {
    this.assertAdmin(principal);
    const domain = await this.prisma.workspaceDomain.findFirst({
      where: {
        id: domainId,
        organizationId: principal.organizationId,
        workspaceId: principal.workspaceId,
      },
    });
    if (!domain) throw new NotFoundException('Workspace domain not found');
    if (domain.status === 'VERIFIED') return domain;

    const recordName = `_sessions-verification.${domain.hostname}`;
    let txtRecords: string[][] = [];
    try {
      txtRecords = await resolveTxt(recordName);
    } catch {
      throw new BadRequestException(
        `DNS verification failed. Add TXT ${recordName} with value sessions-verification=${domain.verificationToken}`,
      );
    }
    const expected = `sessions-verification=${domain.verificationToken}`;
    const verified = txtRecords.some((parts) => parts.join('') === expected);
    if (!verified) {
      throw new BadRequestException(
        `Verification TXT record not found. Expected ${expected}`,
      );
    }

    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.workspaceDomain.update({
        where: { id: domain.id },
        data: { status: 'VERIFIED', verifiedAt: new Date() },
      });
      await this.audit.record(transaction, principal, {
        action: 'workspace.domain.verified',
        resourceType: 'workspace_domain',
        resourceId: updated.id,
        metadata: { hostname: updated.hostname },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'workspace_domain',
        aggregateId: updated.id,
        eventType: 'workspace.domain.verified',
        payload: {
          id: updated.id,
          hostname: updated.hostname,
          status: updated.status,
        },
      });
      return updated;
    });
  }

  async removeDomain(principal: Principal, domainId: string) {
    this.assertAdmin(principal);
    return this.prisma.$transaction(async (transaction) => {
      await this.requireCurrentMembership(principal, transaction);
      const domain = await transaction.workspaceDomain.findFirst({
        where: {
          id: domainId,
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
        },
      });
      if (!domain) throw new NotFoundException('Workspace domain not found');
      await transaction.workspaceDomain.delete({ where: { id: domain.id } });
      await this.audit.record(transaction, principal, {
        action: 'workspace.domain.removed',
        resourceType: 'workspace_domain',
        resourceId: domain.id,
        metadata: { hostname: domain.hostname },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'workspace_domain',
        aggregateId: domain.id,
        eventType: 'workspace.domain.removed',
        payload: { id: domain.id, hostname: domain.hostname },
      });
      return { id: domain.id, removed: true };
    });
  }

  async listMembers(principal: Principal) {
    await this.requireCurrentMembership(principal);
    const members = await this.prisma.workspaceMembership.findMany({
      where: {
        organizationId: principal.organizationId,
        workspaceId: principal.workspaceId,
      },
      include: { user: { include: { mfaFactor: true } } },
      orderBy: [{ role: 'asc' }, { user: { displayName: 'asc' } }],
    });
    return members.map((membership) => this.memberProjection(membership));
  }

  async inviteMember(principal: Principal, input: InviteMemberDto) {
    this.assertAdmin(principal);
    if (input.role === WorkspaceRole.OWNER) {
      throw new BadRequestException(
        'Owner access must be assigned to an existing member through an audited role change',
      );
    }
    const email = input.email.trim().toLowerCase();

    return this.prisma.$transaction(async (transaction) => {
      await this.requireCurrentMembership(principal, transaction);
      const invitationLock = `workspace.invitation:${principal.workspaceId}:${email}`;
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${invitationLock}, 0))`;
      const existingUser = await transaction.user.findUnique({
        where: { email },
        select: { id: true, status: true },
      });
      if (existingUser && existingUser.status !== UserStatus.ACTIVE) {
        throw new ConflictException('This account cannot be invited');
      }
      if (existingUser) {
        const existingMembership = await transaction.workspaceMembership.findUnique({
          where: {
            workspaceId_userId: {
              workspaceId: principal.workspaceId,
              userId: existingUser.id,
            },
          },
          select: { id: true },
        });
        if (existingMembership) {
          throw new ConflictException('This account is already a workspace member');
        }
      }

      const pending = await transaction.workspaceInvitation.findFirst({
        where: {
          workspaceId: principal.workspaceId,
          email,
          acceptedAt: null,
          revokedAt: null,
        },
      });
      const invitationId = pending?.id ?? randomUUID();
      const opaque = this.security.createOpaqueToken(invitationId);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60_000);
      const invitation = pending
        ? await transaction.workspaceInvitation.update({
            where: { id: pending.id },
            data: {
              role: input.role,
              tokenHash: opaque.tokenHash,
              invitedById: principal.userId,
              expiresAt,
            },
          })
        : await transaction.workspaceInvitation.create({
            data: {
              id: invitationId,
              organizationId: principal.organizationId,
              workspaceId: principal.workspaceId,
              email,
              role: input.role,
              tokenHash: opaque.tokenHash,
              invitedById: principal.userId,
              expiresAt,
            },
          });
      await this.audit.record(transaction, principal, {
        action: pending ? 'workspace.invitation.resent' : 'workspace.invitation.created',
        resourceType: 'workspace_invitation',
        resourceId: invitation.id,
        metadata: { email, role: invitation.role },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'workspace_invitation',
        aggregateId: invitation.id,
        eventType: 'workspace.invitation.requested',
        payload: {
          invitationId: invitation.id,
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          email,
          role: invitation.role,
          encryptedToken: this.security.encryptSensitiveValue(
            opaque.token,
            'workspace-invitation-token',
          ),
          expiresAt: expiresAt.toISOString(),
        },
      });
      return {
        ...this.invitationProjection(invitation),
        ...(this.exposeDevelopmentTokens()
          ? { developmentInvitationToken: opaque.token }
          : {}),
      };
    });
  }

  async listInvitations(principal: Principal) {
    this.assertAdmin(principal);
    await this.requireCurrentMembership(principal);
    const invitations = await this.prisma.workspaceInvitation.findMany({
      where: {
        organizationId: principal.organizationId,
        workspaceId: principal.workspaceId,
      },
      include: {
        invitedBy: { select: { id: true, displayName: true, email: true } },
        acceptedBy: { select: { id: true, displayName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return invitations.map((invitation) => this.invitationProjection(invitation));
  }

  async revokeInvitation(principal: Principal, invitationId: string) {
    this.assertAdmin(principal);
    return this.prisma.$transaction(async (transaction) => {
      await this.requireCurrentMembership(principal, transaction);
      const invitation = await transaction.workspaceInvitation.findFirst({
        where: {
          id: invitationId,
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
        },
      });
      if (!invitation) throw new NotFoundException('Invitation not found');
      if (invitation.acceptedAt) {
        throw new ConflictException('An accepted invitation cannot be revoked');
      }
      if (!invitation.revokedAt) {
        await transaction.workspaceInvitation.update({
          where: { id: invitation.id },
          data: { revokedAt: new Date() },
        });
        await this.audit.record(transaction, principal, {
          action: 'workspace.invitation.revoked',
          resourceType: 'workspace_invitation',
          resourceId: invitation.id,
          metadata: { email: invitation.email },
        });
      }
      return { id: invitation.id, revoked: true };
    });
  }

  async updateMemberRole(
    principal: Principal,
    membershipId: string,
    role: WorkspaceRole,
  ) {
    this.assertAdmin(principal);
    return this.prisma.$transaction(async (transaction) => {
      const actorMembership = await this.requireCurrentMembership(principal, transaction);
      const membership = await transaction.workspaceMembership.findFirst({
        where: {
          id: membershipId,
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
        },
        include: { user: { include: { mfaFactor: true } } },
      });
      if (!membership) throw new NotFoundException('Workspace member not found');
      if (
        (membership.role === WorkspaceRole.OWNER || role === WorkspaceRole.OWNER) &&
        actorMembership.role !== WorkspaceRole.OWNER
      ) {
        throw new ForbiddenException('Only a workspace owner can manage owner access');
      }
      if (membership.role === WorkspaceRole.OWNER && role !== WorkspaceRole.OWNER) {
        await this.assertAnotherOwner(transaction, membership.id, principal.workspaceId);
      }
      if (membership.role === role) return this.memberProjection(membership);

      const updated = await transaction.workspaceMembership.update({
        where: { id: membership.id },
        data: { role },
        include: { user: { include: { mfaFactor: true } } },
      });
      await this.audit.record(transaction, principal, {
        action: 'workspace.member.role_changed',
        resourceType: 'workspace_membership',
        resourceId: membership.id,
        metadata: {
          userId: membership.userId,
          from: membership.role,
          to: role,
        },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'workspace_membership',
        aggregateId: membership.id,
        eventType: 'workspace.member.role_changed',
        payload: {
          membershipId: membership.id,
          userId: membership.userId,
          workspaceId: principal.workspaceId,
          role,
        },
      });
      return this.memberProjection(updated);
    });
  }

  async removeMember(principal: Principal, membershipId: string) {
    this.assertAdmin(principal);
    return this.prisma.$transaction(async (transaction) => {
      const actorMembership = await this.requireCurrentMembership(principal, transaction);
      const membership = await transaction.workspaceMembership.findFirst({
        where: {
          id: membershipId,
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
        },
      });
      if (!membership) throw new NotFoundException('Workspace member not found');
      if (
        membership.role === WorkspaceRole.OWNER &&
        actorMembership.role !== WorkspaceRole.OWNER
      ) {
        throw new ForbiddenException('Only a workspace owner can remove another owner');
      }
      if (membership.role === WorkspaceRole.OWNER) {
        await this.assertAnotherOwner(transaction, membership.id, principal.workspaceId);
      }
      await transaction.workspaceMembership.delete({ where: { id: membership.id } });
      await transaction.authSession.updateMany({
        where: {
          userId: membership.userId,
          workspaceId: principal.workspaceId,
          revokedAt: null,
        },
        data: { revokedAt: new Date(), revokedReason: 'workspace_access_removed' },
      });
      await this.audit.record(transaction, principal, {
        action: 'workspace.member.removed',
        resourceType: 'workspace_membership',
        resourceId: membership.id,
        metadata: { userId: membership.userId },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'workspace_membership',
        aggregateId: membership.id,
        eventType: 'workspace.member.removed',
        payload: {
          membershipId: membership.id,
          userId: membership.userId,
          workspaceId: principal.workspaceId,
        },
      });
      return { id: membership.id, removed: true };
    });
  }

  private async requireCurrentMembership(
    principal: Principal,
    transaction: WorkspaceMembershipClient = this.prisma,
  ): Promise<MembershipWithWorkspace> {
    const membership = await transaction.workspaceMembership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: principal.workspaceId,
          userId: principal.userId,
        },
      },
      include: { workspace: { include: { organization: true } } },
    });
    if (!membership || membership.organizationId !== principal.organizationId) {
      throw new ForbiddenException('Workspace access is unavailable');
    }
    return membership;
  }

  private async assertAnotherOwner(
    transaction: Prisma.TransactionClient,
    excludedMembershipId: string,
    workspaceId: string,
  ): Promise<void> {
    const remainingOwners = await transaction.workspaceMembership.count({
      where: {
        workspaceId,
        role: WorkspaceRole.OWNER,
        id: { not: excludedMembershipId },
      },
    });
    if (remainingOwners === 0) {
      throw new ConflictException('A workspace must always have at least one owner');
    }
  }

  private memberProjection(membership: MemberWithUser) {
    return {
      id: membership.id,
      role: membership.role,
      createdAt: membership.createdAt,
      user: {
        id: membership.user.id,
        email: membership.user.email,
        displayName: membership.user.displayName,
        avatarUrl: membership.user.avatarUrl,
        status: membership.user.status,
        emailVerifiedAt: membership.user.emailVerifiedAt,
        lastLoginAt: membership.user.lastLoginAt,
        mfaEnabled: Boolean(
          membership.user.mfaFactor?.verifiedAt &&
            !membership.user.mfaFactor.disabledAt,
        ),
      },
    };
  }

  private invitationProjection(invitation: {
    id: string;
    email: string;
    role: WorkspaceRole;
    expiresAt: Date;
    acceptedAt: Date | null;
    revokedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    invitedBy?: { id: string; displayName: string; email: string };
    acceptedBy?: { id: string; displayName: string; email: string } | null;
  }) {
    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.acceptedAt
        ? 'ACCEPTED'
        : invitation.revokedAt
          ? 'REVOKED'
          : invitation.expiresAt <= new Date()
            ? 'EXPIRED'
            : 'PENDING',
      expiresAt: invitation.expiresAt,
      acceptedAt: invitation.acceptedAt,
      revokedAt: invitation.revokedAt,
      createdAt: invitation.createdAt,
      updatedAt: invitation.updatedAt,
      invitedBy: invitation.invitedBy,
      acceptedBy: invitation.acceptedBy,
    };
  }

  private assertAdmin(principal: Principal): void {
    if (!hasAnyRole(principal, ADMIN_ROLES)) {
      throw new ForbiddenException('A workspace administrator role is required');
    }
  }

  private assertTimeZone(timezone: string): void {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    } catch {
      throw new BadRequestException('timezone must be a valid IANA timezone');
    }
  }

  private jsonObject(value: Prisma.JsonValue): Record<string, unknown> {
    if (!value || Array.isArray(value) || typeof value !== 'object') return {};
    return value as Record<string, unknown>;
  }

  private exposeDevelopmentTokens(): boolean {
    return this.config.get<string>('NODE_ENV') !== 'production';
  }

  private toJson(value: unknown): Prisma.JsonObject {
    return JSON.parse(JSON.stringify(value)) as Prisma.JsonObject;
  }
}
