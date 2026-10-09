import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  AuthChallengePurpose,
  Prisma,
  UserStatus,
  WorkspaceRole,
  type User,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import type { AccessTokenClaims, Principal } from '../common/auth/principal';
import { WorkerPrismaService } from '../database/worker-prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CompleteMfaDto } from './dto/complete-mfa.dto';
import { CreateDevTokenDto } from './dto/create-dev-token.dto';
import { DisableMfaDto } from './dto/disable-mfa.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshSessionDto } from './dto/refresh-session.dto';
import { RequestEmailVerificationDto } from './dto/request-email-verification.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SignUpDto } from './dto/sign-up.dto';
import { SwitchWorkspaceDto } from './dto/switch-workspace.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { SecurityService } from './security.service';

export interface AuthRequestMetadata {
  userAgent?: string;
  ip?: string;
}

type MembershipWithWorkspace = Prisma.WorkspaceMembershipGetPayload<{
  include: { workspace: { include: { organization: true } } };
}>;

type AuthChallengeClient = Pick<Prisma.TransactionClient, 'authChallenge'>;

interface WorkspaceAccess {
  membershipId: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  timezone: string;
  role: WorkspaceRole;
}

interface TokenBundle {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  principal: Principal;
  workspaces: WorkspaceAccess[];
}

const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCK_MINUTES = 15;
const MFA_CHALLENGE_MINUTES = 5;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: WorkerPrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly security: SecurityService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async createDevelopmentSession(
    input: CreateDevTokenDto,
    metadata: AuthRequestMetadata,
  ): Promise<TokenBundle> {
    if (
      this.config.get<string>('NODE_ENV') === 'production' ||
      this.config.get<string>('AUTH_MODE') !== 'development'
    ) {
      throw new NotFoundException();
    }
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
    });
    if (
      !user ||
      user.status !== UserStatus.ACTIVE ||
      user.email.toLowerCase() !== input.email.toLowerCase()
    ) {
      throw new ForbiddenException('The development identity is unavailable');
    }
    const membership = await this.prisma.workspaceMembership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: input.workspaceId,
          userId: input.userId,
        },
      },
      include: { workspace: { include: { organization: true } } },
    });
    if (
      !membership ||
      membership.organizationId !== input.organizationId
    ) {
      throw new ForbiddenException('The development workspace access is unavailable');
    }
    return this.prisma.$transaction((transaction) =>
      this.issueTokens(transaction, user, membership, metadata),
    );
  }

  async createExternalIdentitySession(
    userId: string,
    workspaceId: string,
    metadata: AuthRequestMetadata,
  ): Promise<TokenBundle> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('The enterprise identity is unavailable');
    }
    const membership = await this.prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      include: { workspace: { include: { organization: true } } },
    });
    if (!membership) {
      throw new ForbiddenException('Workspace access is unavailable');
    }
    return this.prisma.$transaction((transaction) =>
      this.issueTokens(transaction, user, membership, metadata),
    );
  }
  async signUp(input: SignUpDto, metadata: AuthRequestMetadata) {
    this.assertLocalAuthenticationEnabled();
    this.assertTimeZone(input.timezone);
    const email = input.email.trim().toLowerCase();
    const passwordHash = await this.security.hashPassword(input.password);
    const requireVerification = this.config.get<boolean>(
      'AUTH_REQUIRE_EMAIL_VERIFICATION',
      false,
    );

    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException('An account with this email already exists');
      }
      const organizationConflict = await transaction.organization.findUnique({
        where: { slug: input.organizationSlug },
        select: { id: true },
      });
      if (organizationConflict) {
        throw new ConflictException('This organization URL is already in use');
      }

      const organization = await transaction.organization.create({
        data: {
          name: input.organizationName.trim(),
          slug: input.organizationSlug,
        },
      });
      const workspace = await transaction.workspace.create({
        data: {
          organizationId: organization.id,
          name: input.workspaceName.trim(),
          slug: input.workspaceSlug,
          timezone: input.timezone,
          settings: {
            recordingConsentRequired: true,
            authPolicy: { mfaRecommended: true },
          },
        },
      });
      const user = await transaction.user.create({
        data: {
          email,
          displayName: input.displayName.trim(),
          passwordHash,
          emailVerifiedAt: requireVerification ? null : new Date(),
        },
      });
      const membership = await transaction.workspaceMembership.create({
        data: {
          organizationId: organization.id,
          workspaceId: workspace.id,
          userId: user.id,
          role: WorkspaceRole.OWNER,
        },
        include: { workspace: { include: { organization: true } } },
      });
      const principal = this.principalFor(user, membership);
      await this.audit.record(transaction, principal, {
        action: 'auth.account.created',
        resourceType: 'user',
        resourceId: user.id,
        metadata: { organizationId: organization.id, workspaceId: workspace.id },
      });

      if (requireVerification) {
        const verificationToken = await this.issueEmailVerificationToken(
          transaction,
          user,
          membership,
        );
        return {
          verificationRequired: true,
          email,
          ...(this.exposeDevelopmentTokens()
            ? { developmentVerificationToken: verificationToken }
            : {}),
        };
      }

      return this.issueTokens(transaction, user, membership, metadata);
    });
  }

  async login(input: LoginDto, metadata: AuthRequestMetadata) {
    this.assertLocalAuthenticationEnabled();
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          include: { workspace: { include: { organization: true } } },
          orderBy: { createdAt: 'asc' },
        },
        mfaFactor: true,
      },
    });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordValid = await this.security.verifyPassword(
      input.password,
      user.passwordHash,
    );
    if (!passwordValid) {
      await this.recordFailedLogin(user.id);
      throw new UnauthorizedException('Invalid email or password');
    }
    if (
      this.config.get<boolean>('AUTH_REQUIRE_EMAIL_VERIFICATION', false) &&
      !user.emailVerifiedAt
    ) {
      throw new ForbiddenException('Verify your email before signing in');
    }
    const membership = this.selectMembership(user.memberships, input.workspaceSlug);
    if (!membership) {
      throw new ForbiddenException('This account does not have an active workspace');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    if (user.mfaFactor?.verifiedAt && !user.mfaFactor.disabledAt) {
      return this.createMfaChallenge(user, membership);
    }

    return this.prisma.$transaction((transaction) =>
      this.issueTokens(transaction, user, membership, metadata),
    );
  }

  async completeMfa(input: CompleteMfaDto, metadata: AuthRequestMetadata) {
    this.assertLocalAuthenticationEnabled();
    let claims: Record<string, unknown>;
    try {
      claims = await this.jwt.verifyAsync<Record<string, unknown>>(
        input.challengeToken,
        {
          issuer: this.config.getOrThrow<string>('JWT_ISSUER'),
          audience: this.config.getOrThrow<string>('JWT_AUDIENCE'),
        },
      );
    } catch {
      throw new UnauthorizedException('The MFA challenge is invalid or expired');
    }
    if (
      claims.tokenType !== 'mfa_challenge' ||
      typeof claims.challengeId !== 'string' ||
      typeof claims.sub !== 'string'
    ) {
      throw new UnauthorizedException('The MFA challenge is invalid or expired');
    }

    const challengeId = claims.challengeId as string;
    const challengeUserId = claims.sub as string;

    const result = await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${challengeId}, 0))`;
      const challenge = await transaction.authChallenge.findUnique({
        where: { id: challengeId },
        include: {
          user: true,
          workspace: { include: { organization: true } },
        },
      });
      const factor = challenge
        ? await transaction.userMfaFactor.findUnique({
            where: { userId: challenge.userId },
          })
        : null;
      if (
        !challenge ||
        challenge.userId !== challengeUserId ||
        challenge.purpose !== AuthChallengePurpose.MFA_LOGIN ||
        challenge.consumedAt ||
        challenge.expiresAt <= new Date() ||
        challenge.attempts >= MAX_LOGIN_ATTEMPTS ||
        !factor?.verifiedAt ||
        factor.disabledAt
      ) {
        return { error: 'invalid_challenge' } as const;
      }

      const verified = await this.verifyMfaCode(transaction, factor, input.code);
      if (!verified) {
        const attempts = challenge.attempts + 1;
        await transaction.authChallenge.update({
          where: { id: challenge.id },
          data: {
            attempts,
            ...(attempts >= MAX_LOGIN_ATTEMPTS ? { consumedAt: new Date() } : {}),
          },
        });
        return { error: 'invalid_code' } as const;
      }

      const membership = await transaction.workspaceMembership.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: challenge.workspaceId,
            userId: challenge.userId,
          },
        },
        include: { workspace: { include: { organization: true } } },
      });
      if (!membership || membership.organizationId !== challenge.organizationId) {
        return { error: 'workspace_access' } as const;
      }
      await transaction.authChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      });
      return {
        bundle: await this.issueTokens(
          transaction,
          challenge.user,
          membership,
          metadata,
        ),
      } as const;
    });

    if ('bundle' in result) return result.bundle;
    const error = 'error' in result ? result.error : 'invalid_challenge';
    if (error === 'workspace_access') {
      throw new ForbiddenException('Workspace access is no longer available');
    }
    throw new UnauthorizedException(
      error === 'invalid_code'
        ? 'The MFA code is invalid'
        : 'The MFA challenge is invalid or expired',
    );
  }

  async refresh(input: RefreshSessionDto, metadata: AuthRequestMetadata) {
    return this.rotateRefreshToken(input.refreshToken, metadata);
  }

  async switchWorkspace(
    principal: Principal,
    input: SwitchWorkspaceDto,
    metadata: AuthRequestMetadata,
  ) {
    if (!principal.sessionId) {
      throw new ForbiddenException('Workspace switching requires a managed login session');
    }
    return this.rotateRefreshToken(input.refreshToken, metadata, input.workspaceId, principal.userId);
  }

  async logout(principal: Principal, refreshToken?: string) {
    const sessionId = refreshToken
      ? this.security.parseOpaqueToken(refreshToken)?.id
      : principal.sessionId;
    if (!sessionId) return { loggedOut: true };
    await this.prisma.authSession.updateMany({
      where: { id: sessionId, userId: principal.userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'user_logout' },
    });
    return { loggedOut: true };
  }

  async me(principal: Principal) {
    const user = await this.prisma.user.findUnique({
      where: { id: principal.userId },
      include: {
        memberships: {
          include: { workspace: { include: { organization: true } } },
          orderBy: { createdAt: 'asc' },
        },
        mfaFactor: { select: { verifiedAt: true, disabledAt: true } },
      },
    });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('The account is unavailable');
    }
    return {
      principal,
      profile: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        emailVerifiedAt: user.emailVerifiedAt,
        mfaEnabled: Boolean(user.mfaFactor?.verifiedAt && !user.mfaFactor.disabledAt),
      },
      workspaces: user.memberships.map((membership) =>
        this.workspaceProjection(membership),
      ),
    };
  }

  async listSessions(principal: Principal) {
    const sessions = await this.prisma.authSession.findMany({
      where: {
        userId: principal.userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { workspace: { include: { organization: true } } },
      orderBy: { lastUsedAt: 'desc' },
    });
    return sessions.map((session) => ({
      id: session.id,
      workspace: {
        id: session.workspace.id,
        name: session.workspace.name,
        organization: session.workspace.organization.name,
      },
      userAgent: session.userAgent,
      createdAt: session.createdAt,
      lastUsedAt: session.lastUsedAt,
      expiresAt: session.expiresAt,
      current: session.id === principal.sessionId,
    }));
  }

  async revokeSession(principal: Principal, sessionId: string) {
    const result = await this.prisma.authSession.updateMany({
      where: { id: sessionId, userId: principal.userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'user_revoked' },
    });
    if (result.count === 0) throw new NotFoundException('Login session not found');
    return { id: sessionId, revoked: true };
  }

  async changePassword(principal: Principal, input: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: principal.userId } });
    if (!user) throw new UnauthorizedException('The account is unavailable');
    const valid = await this.security.verifyPassword(input.currentPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedException('The current password is incorrect');
    const passwordHash = await this.security.hashPassword(input.newPassword);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: user.id },
        data: { passwordHash },
      });
      await transaction.authSession.updateMany({
        where: {
          userId: user.id,
          revokedAt: null,
          ...(principal.sessionId ? { id: { not: principal.sessionId } } : {}),
        },
        data: { revokedAt: new Date(), revokedReason: 'password_changed' },
      });
      await this.audit.record(transaction, principal, {
        action: 'auth.password.changed',
        resourceType: 'user',
        resourceId: user.id,
      });
    });
    return { changed: true };
  }

  async requestEmailVerification(input: RequestEmailVerificationDto) {
    this.assertLocalAuthenticationEnabled();
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          include: { workspace: { include: { organization: true } } },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });
    if (
      !user ||
      user.status !== UserStatus.ACTIVE ||
      user.emailVerifiedAt ||
      user.memberships.length === 0
    ) {
      return { accepted: true };
    }

    const membership = user.memberships[0]!;
    const token = await this.prisma.$transaction(async (transaction) => {
      await transaction.emailVerificationToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      return this.issueEmailVerificationToken(transaction, user, membership);
    });
    return {
      accepted: true,
      ...(this.exposeDevelopmentTokens()
        ? { developmentVerificationToken: token }
        : {}),
    };
  }

  async requestPasswordReset(input: RequestPasswordResetDto) {
    this.assertLocalAuthenticationEnabled();
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          include: { workspace: { include: { organization: true } } },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });
    if (!user || user.status !== UserStatus.ACTIVE || user.memberships.length === 0) {
      return { accepted: true };
    }

    const membership = user.memberships[0]!;
    const token = await this.prisma.$transaction(async (transaction) => {
      await transaction.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      const id = randomUUID();
      const opaque = this.security.createOpaqueToken(id);
      const expiresAt = new Date(Date.now() + 60 * 60_000);
      await transaction.passwordResetToken.create({
        data: { id, userId: user.id, tokenHash: opaque.tokenHash, expiresAt },
      });
      await this.outbox.enqueue(transaction, membership, {
        aggregateType: 'password_reset',
        aggregateId: id,
        eventType: 'auth.password_reset.requested',
        payload: {
          userId: user.id,
          email: user.email,
          encryptedToken: this.security.encryptSensitiveValue(
            opaque.token,
            'password-reset-token',
          ),
          expiresAt: expiresAt.toISOString(),
        },
      });
      return opaque.token;
    });
    return {
      accepted: true,
      ...(this.exposeDevelopmentTokens() ? { developmentResetToken: token } : {}),
    };
  }

  async resetPassword(input: ResetPasswordDto) {
    this.assertLocalAuthenticationEnabled();
    const parsed = this.security.parseOpaqueToken(input.token);
    if (!parsed) throw new BadRequestException('The reset token is invalid or expired');
    const passwordHash = await this.security.hashPassword(input.password);
    const reset = await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${parsed.id}, 0))`;
      const token = await transaction.passwordResetToken.findUnique({
        where: { id: parsed.id },
      });
      if (
        !token ||
        token.usedAt ||
        token.expiresAt <= new Date() ||
        !this.security.verifyTokenDigest(parsed.secret, token.tokenHash)
      ) {
        return false;
      }
      await transaction.passwordResetToken.update({
        where: { id: token.id },
        data: { usedAt: new Date() },
      });
      await transaction.user.update({
        where: { id: token.userId },
        data: {
          passwordHash,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
      await transaction.authSession.updateMany({
        where: { userId: token.userId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'password_reset' },
      });
      return true;
    });
    if (!reset) throw new BadRequestException('The reset token is invalid or expired');
    return { reset: true };
  }

  async verifyEmail(input: VerifyEmailDto, metadata: AuthRequestMetadata) {
    this.assertLocalAuthenticationEnabled();
    const parsed = this.security.parseOpaqueToken(input.token);
    if (!parsed) throw new BadRequestException('The verification token is invalid or expired');

    const result = await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${parsed.id}, 0))`;
      const token = await transaction.emailVerificationToken.findUnique({
        where: { id: parsed.id },
        include: { user: true },
      });
      if (
        !token ||
        token.usedAt ||
        token.expiresAt <= new Date() ||
        !this.security.verifyTokenDigest(parsed.secret, token.tokenHash)
      ) {
        return { error: 'invalid' } as const;
      }
      const membership = await transaction.workspaceMembership.findFirst({
        where: { userId: token.userId },
        include: { workspace: { include: { organization: true } } },
        orderBy: { createdAt: 'asc' },
      });
      if (!membership) return { error: 'workspace_access' } as const;
      const user = await transaction.user.update({
        where: { id: token.userId },
        data: { emailVerifiedAt: token.user.emailVerifiedAt ?? new Date() },
      });
      await transaction.emailVerificationToken.update({
        where: { id: token.id },
        data: { usedAt: new Date() },
      });
      return {
        bundle: await this.issueTokens(transaction, user, membership, metadata),
      } as const;
    });
    if ('bundle' in result) return result.bundle;
    if (result.error === 'workspace_access') {
      throw new ForbiddenException('Workspace access is unavailable');
    }
    throw new BadRequestException('The verification token is invalid or expired');
  }

  async setupMfa(principal: Principal) {
    const user = await this.prisma.user.findUnique({
      where: { id: principal.userId },
      include: { mfaFactor: true },
    });
    if (!user?.passwordHash) {
      throw new ConflictException('MFA setup requires a password-based account');
    }
    if (user.mfaFactor?.verifiedAt && !user.mfaFactor.disabledAt) {
      throw new ConflictException('MFA is already enabled');
    }
    const secret = this.security.generateTotpSecret();
    const recovery = this.security.generateRecoveryCodes();
    await this.prisma.userMfaFactor.upsert({
      where: { userId: principal.userId },
      update: {
        encryptedSecret: this.security.encryptMfaSecret(secret),
        recoveryCodeHashes: recovery.hashes,
        verifiedAt: null,
        disabledAt: null,
      },
      create: {
        userId: principal.userId,
        encryptedSecret: this.security.encryptMfaSecret(secret),
        recoveryCodeHashes: recovery.hashes,
      },
    });
    return {
      secret,
      otpauthUri: this.security.createTotpUri(secret, user.email),
      recoveryCodes: recovery.codes,
    };
  }

  async confirmMfa(principal: Principal, code: string) {
    const factor = await this.prisma.userMfaFactor.findUnique({
      where: { userId: principal.userId },
    });
    if (!factor || factor.disabledAt) throw new NotFoundException('MFA setup not found');
    const secret = this.security.decryptMfaSecret(factor.encryptedSecret);
    if (!this.security.verifyTotp(secret, code)) {
      throw new BadRequestException('The MFA code is invalid');
    }
    await this.prisma.$transaction(async (transaction) => {
      await transaction.userMfaFactor.update({
        where: { id: factor.id },
        data: { verifiedAt: new Date() },
      });
      await this.audit.record(transaction, principal, {
        action: 'auth.mfa.enabled',
        resourceType: 'user',
        resourceId: principal.userId,
      });
    });
    return { enabled: true };
  }

  async disableMfa(principal: Principal, input: DisableMfaDto) {
    await this.prisma.$transaction(async (transaction) => {
      const factor = await transaction.userMfaFactor.findUnique({
        where: { userId: principal.userId },
      });
      if (!factor?.verifiedAt || factor.disabledAt) {
        throw new NotFoundException('MFA is not enabled');
      }
      const verified = await this.verifyMfaCode(transaction, factor, input.code);
      if (!verified) throw new BadRequestException('The MFA code is invalid');
      await transaction.userMfaFactor.delete({ where: { id: factor.id } });
      await this.audit.record(transaction, principal, {
        action: 'auth.mfa.disabled',
        resourceType: 'user',
        resourceId: principal.userId,
      });
    });
    return { enabled: false };
  }

  async acceptInvitation(input: AcceptInvitationDto, metadata: AuthRequestMetadata) {
    this.assertLocalAuthenticationEnabled();
    const parsed = this.security.parseOpaqueToken(input.token);
    if (!parsed) throw new BadRequestException('The invitation is invalid or expired');
    const invitation = await this.prisma.workspaceInvitation.findUnique({
      where: { id: parsed.id },
    });
    if (
      !invitation ||
      invitation.acceptedAt ||
      invitation.revokedAt ||
      invitation.expiresAt <= new Date() ||
      !this.security.verifyTokenDigest(parsed.secret, invitation.tokenHash)
    ) {
      throw new BadRequestException('The invitation is invalid or expired');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: invitation.email },
    });
    let passwordHash: string | undefined;
    if (existingUser) {
      if (existingUser.status !== UserStatus.ACTIVE) {
        throw new ForbiddenException('The account is unavailable');
      }
      const valid = await this.security.verifyPassword(
        input.password,
        existingUser.passwordHash,
      );
      if (!valid) throw new UnauthorizedException('The account password is incorrect');
    } else {
      if (!input.displayName?.trim()) {
        throw new BadRequestException('displayName is required for a new account');
      }
      passwordHash = await this.security.hashPassword(input.password);
    }

    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${invitation.id}, 0))`;
      const current = await transaction.workspaceInvitation.findUnique({
        where: { id: invitation.id },
      });
      if (
        !current ||
        current.acceptedAt ||
        current.revokedAt ||
        current.expiresAt <= new Date() ||
        !this.security.verifyTokenDigest(parsed.secret, current.tokenHash)
      ) {
        throw new ConflictException('The invitation is no longer available');
      }

      let user = existingUser;
      if (!user) {
        user = await transaction.user.create({
          data: {
            email: current.email,
            displayName: input.displayName!.trim(),
            passwordHash: passwordHash!,
            emailVerifiedAt: new Date(),
          },
        });
      }
      const membership = await transaction.workspaceMembership.upsert({
        where: {
          workspaceId_userId: {
            workspaceId: current.workspaceId,
            userId: user.id,
          },
        },
        update: {},
        create: {
          organizationId: current.organizationId,
          workspaceId: current.workspaceId,
          userId: user.id,
          role: current.role,
        },
        include: { workspace: { include: { organization: true } } },
      });
      await transaction.workspaceInvitation.update({
        where: { id: current.id },
        data: { acceptedAt: new Date(), acceptedById: user.id },
      });
      await this.outbox.enqueue(transaction, membership, {
        aggregateType: 'workspace_invitation',
        aggregateId: current.id,
        eventType: 'workspace.invitation.accepted',
        payload: {
          invitationId: current.id,
          workspaceId: current.workspaceId,
          userId: user.id,
        },
      });
      const factor = await transaction.userMfaFactor.findUnique({
        where: { userId: user.id },
      });
      if (factor?.verifiedAt && !factor.disabledAt) {
        return this.createMfaChallenge(user, membership, transaction);
      }
      return this.issueTokens(transaction, user, membership, metadata);
    });
  }

  async resolvePrincipalFromClaims(claims: AccessTokenClaims): Promise<Principal> {
    if (!claims.sid) {
      if (this.config.get<string>('AUTH_MODE') !== 'development') {
        throw new UnauthorizedException('The login session is unavailable');
      }
      return {
        userId: claims.sub,
        organizationId: claims.organizationId,
        workspaceId: claims.workspaceId,
        email: claims.email,
        displayName: claims.displayName,
        roles: claims.roles,
      };
    }

    const session = await this.prisma.authSession.findUnique({
      where: { id: claims.sid },
      include: { user: true },
    });
    if (
      !session ||
      session.userId !== claims.sub ||
      session.organizationId !== claims.organizationId ||
      session.workspaceId !== claims.workspaceId ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.status !== UserStatus.ACTIVE
    ) {
      throw new UnauthorizedException('The login session is invalid or expired');
    }
    const membership = await this.prisma.workspaceMembership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: session.workspaceId,
          userId: session.userId,
        },
      },
    });
    if (!membership || membership.organizationId !== session.organizationId) {
      throw new UnauthorizedException('Workspace access is no longer available');
    }
    return {
      userId: session.userId,
      organizationId: session.organizationId,
      workspaceId: session.workspaceId,
      email: session.user.email,
      displayName: session.user.displayName,
      roles: [membership.role],
      sessionId: session.id,
    };
  }

  private async recordFailedLogin(userId: string): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`;
      const current = await transaction.user.findUnique({
        where: { id: userId },
        select: { failedLoginAttempts: true },
      });
      if (!current) return;
      const attempts = current.failedLoginAttempts + 1;
      await transaction.user.update({
        where: { id: userId },
        data:
          attempts >= MAX_LOGIN_ATTEMPTS
            ? {
                failedLoginAttempts: 0,
                lockedUntil: new Date(Date.now() + LOGIN_LOCK_MINUTES * 60_000),
              }
            : { failedLoginAttempts: attempts },
      });
    });
  }

  private async createMfaChallenge(
    user: User,
    membership: MembershipWithWorkspace,
    client: AuthChallengeClient = this.prisma,
  ) {
    await client.authChallenge.updateMany({
      where: {
        userId: user.id,
        purpose: AuthChallengePurpose.MFA_LOGIN,
        consumedAt: null,
      },
      data: { consumedAt: new Date() },
    });
    const challenge = await client.authChallenge.create({
      data: {
        userId: user.id,
        organizationId: membership.organizationId,
        workspaceId: membership.workspaceId,
        purpose: AuthChallengePurpose.MFA_LOGIN,
        expiresAt: new Date(Date.now() + MFA_CHALLENGE_MINUTES * 60_000),
      },
    });
    const challengeToken = await this.jwt.signAsync(
      {
        tokenType: 'mfa_challenge',
        challengeId: challenge.id,
      },
      {
        subject: user.id,
        expiresIn: MFA_CHALLENGE_MINUTES * 60,
      },
    );
    return {
      mfaRequired: true,
      challengeToken,
      expiresIn: MFA_CHALLENGE_MINUTES * 60,
    };
  }

  private async rotateRefreshToken(
    refreshToken: string,
    metadata: AuthRequestMetadata,
    targetWorkspaceId?: string,
    expectedUserId?: string,
  ): Promise<TokenBundle> {
    const parsed = this.security.parseOpaqueToken(refreshToken);
    if (!parsed) throw new UnauthorizedException('The refresh token is invalid or expired');

    const result = await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${parsed.id}, 0))`;
      const session = await transaction.authSession.findUnique({
        where: { id: parsed.id },
        include: { user: true },
      });
      if (
        !session ||
        (expectedUserId && session.userId !== expectedUserId) ||
        !this.security.verifyTokenDigest(parsed.secret, session.refreshTokenHash)
      ) {
        return { error: 'invalid' } as const;
      }
      if (session.revokedAt) {
        await transaction.authSession.updateMany({
          where: { familyId: session.familyId, revokedAt: null },
          data: { revokedAt: new Date(), revokedReason: 'refresh_token_reuse' },
        });
        return { error: 'reuse' } as const;
      }
      if (session.expiresAt <= new Date() || session.user.status !== UserStatus.ACTIVE) {
        await transaction.authSession.update({
          where: { id: session.id },
          data: {
            revokedAt: session.revokedAt ?? new Date(),
            revokedReason: session.revokedReason ?? 'expired',
          },
        });
        return { error: 'expired' } as const;
      }

      const membership = await transaction.workspaceMembership.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: targetWorkspaceId ?? session.workspaceId,
            userId: session.userId,
          },
        },
        include: { workspace: { include: { organization: true } } },
      });
      if (!membership) return { error: 'workspace_access' } as const;

      const replacementId = randomUUID();
      await transaction.authSession.update({
        where: { id: session.id },
        data: {
          revokedAt: new Date(),
          revokedReason: targetWorkspaceId ? 'workspace_switched' : 'rotated',
          replacedById: replacementId,
          lastUsedAt: new Date(),
        },
      });
      return {
        bundle: await this.issueTokens(
          transaction,
          session.user,
          membership,
          metadata,
          session.familyId,
          replacementId,
        ),
      } as const;
    });

    if ('bundle' in result) return result.bundle;
    if (result.error === 'workspace_access') {
      throw new ForbiddenException('Workspace access is unavailable');
    }
    throw new UnauthorizedException('The refresh token is invalid or expired');
  }

  private async issueTokens(
    transaction: Prisma.TransactionClient,
    user: Pick<User, 'id' | 'email' | 'displayName'>,
    membership: MembershipWithWorkspace,
    metadata: AuthRequestMetadata,
    familyId: string = randomUUID(),
    sessionId: string = randomUUID(),
  ): Promise<TokenBundle> {
    const refresh = this.security.createOpaqueToken(sessionId);
    const accessTokenExpiresIn = this.config.get<number>(
      'ACCESS_TOKEN_TTL_SECONDS',
      15 * 60,
    );
    const refreshTokenDays = this.config.get<number>('REFRESH_TOKEN_TTL_DAYS', 30);
    const refreshTokenExpiresAt = new Date(
      Date.now() + refreshTokenDays * 24 * 60 * 60_000,
    );
    await transaction.authSession.create({
      data: {
        id: sessionId,
        userId: user.id,
        organizationId: membership.organizationId,
        workspaceId: membership.workspaceId,
        familyId,
        refreshTokenHash: refresh.tokenHash,
        userAgent: metadata.userAgent?.slice(0, 500) || null,
        ipHash: this.security.hashIp(metadata.ip),
        expiresAt: refreshTokenExpiresAt,
      },
    });
    const principal = this.principalFor(user, membership, sessionId);
    const accessToken = await this.jwt.signAsync(
      {
        organizationId: principal.organizationId,
        workspaceId: principal.workspaceId,
        email: principal.email,
        displayName: principal.displayName,
        roles: principal.roles,
        sid: sessionId,
      },
      { subject: user.id, expiresIn: accessTokenExpiresIn },
    );
    const workspaces = await this.membershipsForUser(transaction, user.id);
    return {
      accessToken,
      accessTokenExpiresIn,
      refreshToken: refresh.token,
      refreshTokenExpiresAt: refreshTokenExpiresAt.toISOString(),
      principal,
      workspaces: workspaces.map((item) => this.workspaceProjection(item)),
    };
  }

  private async issueEmailVerificationToken(
    transaction: Prisma.TransactionClient,
    user: User,
    membership: MembershipWithWorkspace,
  ): Promise<string> {
    const id = randomUUID();
    const opaque = this.security.createOpaqueToken(id);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60_000);
    await transaction.emailVerificationToken.create({
      data: { id, userId: user.id, tokenHash: opaque.tokenHash, expiresAt },
    });
    await this.outbox.enqueue(transaction, membership, {
      aggregateType: 'email_verification',
      aggregateId: id,
      eventType: 'auth.email_verification.requested',
      payload: {
        userId: user.id,
        email: user.email,
        encryptedToken: this.security.encryptSensitiveValue(
          opaque.token,
          'email-verification-token',
        ),
        expiresAt: expiresAt.toISOString(),
      },
    });
    return opaque.token;
  }

  private async verifyMfaCode(
    transaction: Prisma.TransactionClient,
    factor: {
      id: string;
      encryptedSecret: string;
      recoveryCodeHashes: Prisma.JsonValue;
    },
    code: string,
  ): Promise<boolean> {
    const secret = this.security.decryptMfaSecret(factor.encryptedSecret);
    if (/^\d{6}$/.test(code) && this.security.verifyTotp(secret, code)) return true;

    const rawHashes: unknown = factor.recoveryCodeHashes;
    const hashes = Array.isArray(rawHashes)
      ? rawHashes.filter((value): value is string => typeof value === 'string')
      : [];
    const candidate = this.security.hashRecoveryCode(code);
    const index = hashes.indexOf(candidate);
    if (index < 0) return false;
    hashes.splice(index, 1);
    await transaction.userMfaFactor.update({
      where: { id: factor.id },
      data: { recoveryCodeHashes: hashes as Prisma.InputJsonValue },
    });
    return true;
  }

  private selectMembership(
    memberships: MembershipWithWorkspace[],
    workspaceSlug?: string,
  ): MembershipWithWorkspace | undefined {
    if (!workspaceSlug) return memberships[0];
    return memberships.find((membership) => membership.workspace.slug === workspaceSlug);
  }

  private async membershipsForUser(
    transaction: Prisma.TransactionClient,
    userId: string,
  ): Promise<MembershipWithWorkspace[]> {
    return transaction.workspaceMembership.findMany({
      where: { userId },
      include: { workspace: { include: { organization: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  private principalFor(
    user: Pick<User, 'id' | 'email' | 'displayName'>,
    membership: MembershipWithWorkspace,
    sessionId?: string,
  ): Principal {
    return {
      userId: user.id,
      organizationId: membership.organizationId,
      workspaceId: membership.workspaceId,
      email: user.email,
      displayName: user.displayName,
      roles: [membership.role],
      ...(sessionId ? { sessionId } : {}),
    };
  }

  private workspaceProjection(membership: MembershipWithWorkspace): WorkspaceAccess {
    return {
      membershipId: membership.id,
      organizationId: membership.organizationId,
      organizationName: membership.workspace.organization.name,
      organizationSlug: membership.workspace.organization.slug,
      workspaceId: membership.workspaceId,
      workspaceName: membership.workspace.name,
      workspaceSlug: membership.workspace.slug,
      timezone: membership.workspace.timezone,
      role: membership.role,
    };
  }

  private assertLocalAuthenticationEnabled(): void {
    const mode = this.config.get<string>('AUTH_MODE');
    if (!['development', 'local'].includes(mode ?? '')) {
      throw new NotFoundException();
    }
  }

  private assertTimeZone(timezone: string): void {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    } catch {
      throw new BadRequestException('timezone must be a valid IANA timezone');
    }
  }

  private exposeDevelopmentTokens(): boolean {
    return this.config.get<string>('NODE_ENV') !== 'production';
  }
}
