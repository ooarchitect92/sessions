import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EnterpriseIdentityProviderKind,
  EnterpriseIdentityProviderStatus,
  Prisma,
  ScimTokenStatus,
  WorkspaceRole,
} from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { AuthService, type AuthRequestMetadata } from '../auth/auth.service';
import { SecurityService } from '../auth/security.service';
import {
  ADMIN_ROLES,
  hasAnyRole,
  type Principal,
} from '../common/auth/principal';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { WorkerPrismaService } from '../database/worker-prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import type { CreateEnterpriseIdentityProviderDto } from './dto/create-enterprise-identity-provider.dto';
import type { CreateScimTokenDto } from './dto/create-scim-token.dto';
import type { OidcCallbackDto } from './dto/oidc-callback.dto';
import type { RotateEnterpriseClientSecretDto } from './dto/rotate-enterprise-client-secret.dto';
import type { UpdateEnterpriseIdentityProviderDto } from './dto/update-enterprise-identity-provider.dto';
import { EnterpriseHttpService } from './enterprise-http.service';
import {
  type JsonWebKeySet,
  verifyOidcIdToken,
} from './oidc-token-verifier';

interface OidcDiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  code_challenge_methods_supported?: string[];
}

interface OidcTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  id_token?: string;
  error?: string;
  error_description?: string;
}

const JIT_ALLOWED_ROLES = new Set<WorkspaceRole>([
  WorkspaceRole.MEMBER,
  WorkspaceRole.HOST,
  WorkspaceRole.ANALYST,
]);

@Injectable()
export class EnterpriseIdentityService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly worker: WorkerPrismaService,
    private readonly security: SecurityService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly http: EnterpriseHttpService,
    private readonly config: ConfigService,
  ) {}

  async listProviders(principal: Principal) {
    this.assertAdmin(principal);
    return this.database.run(principal, async (transaction) => {
      const providers = await transaction.enterpriseIdentityProvider.findMany({
        orderBy: { createdAt: 'asc' },
      });
      return providers.map((provider) => this.providerProjection(provider));
    });
  }

  async createProvider(
    principal: Principal,
    input: CreateEnterpriseIdentityProviderDto,
  ) {
    this.assertAdmin(principal);
    const domains = this.normalizeDomains(input.allowedDomains);
    const role = input.defaultRole ?? WorkspaceRole.MEMBER;
    this.assertSafeJitRole(role);
    const scopes = this.normalizeScopes(input.scopes ?? [
      'openid',
      'email',
      'profile',
    ]);
    const id = randomUUID();

    let discovery: OidcDiscoveryDocument | null = null;
    if (input.kind === EnterpriseIdentityProviderKind.OIDC) {
      if (!input.issuer || !input.clientId || !input.clientSecret) {
        throw new BadRequestException(
          'OIDC issuer, clientId and clientSecret are required',
        );
      }
      discovery = await this.discoverOidc(input.issuer);
    }

    return this.database.run(principal, async (transaction) => {
      try {
        const created = await transaction.enterpriseIdentityProvider.create({
          data: {
            id,
            organizationId: principal.organizationId,
            workspaceId: principal.workspaceId,
            kind: input.kind,
            name: input.name.trim(),
            status:
              input.kind === EnterpriseIdentityProviderKind.SAML
                ? EnterpriseIdentityProviderStatus.DISABLED
                : EnterpriseIdentityProviderStatus.ACTIVE,
            issuer:
              input.kind === EnterpriseIdentityProviderKind.OIDC
                ? discovery!.issuer
                : input.issuer ?? null,
            clientId: input.clientId ?? null,
            clientSecretCiphertext: input.clientSecret
              ? this.security.encryptSensitiveValue(
                  input.clientSecret,
                  this.clientSecretPurpose(id),
                )
              : null,
            authorizationEndpoint: discovery?.authorization_endpoint ?? null,
            tokenEndpoint: discovery?.token_endpoint ?? null,
            jwksUri: discovery?.jwks_uri ?? null,
            scopes,
            allowedDomains: domains,
            emailClaim: input.emailClaim?.trim() || 'email',
            nameClaim: input.nameClaim?.trim() || 'name',
            defaultRole: role,
            enforceSso: input.enforceSso ?? false,
            metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
            lastValidatedAt: discovery ? new Date() : null,
            lastError:
              input.kind === EnterpriseIdentityProviderKind.SAML
                ? 'saml_runtime_not_qualified'
                : null,
          },
        });
        await this.audit.record(transaction, principal, {
          action: 'enterprise.identity_provider.created',
          resourceType: 'enterprise_identity_provider',
          resourceId: created.id,
          metadata: {
            kind: created.kind,
            name: created.name,
            allowedDomains: domains,
          },
        });
        await this.outbox.enqueue(transaction, principal, {
          aggregateType: 'enterprise_identity_provider',
          aggregateId: created.id,
          eventType: 'enterprise.identity_provider.created',
          payload: {
            providerId: created.id,
            kind: created.kind,
            name: created.name,
          },
        });
        return this.providerProjection(created);
      } catch (error: unknown) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new ConflictException(
            'An identity provider with this name already exists',
          );
        }
        throw error;
      }
    });
  }

  async updateProvider(
    principal: Principal,
    providerId: string,
    input: UpdateEnterpriseIdentityProviderDto,
  ) {
    this.assertAdmin(principal);
    const role = input.defaultRole;
    if (role) this.assertSafeJitRole(role);
    const domains =
      input.allowedDomains !== undefined
        ? this.normalizeDomains(input.allowedDomains)
        : undefined;
    const scopes =
      input.scopes !== undefined ? this.normalizeScopes(input.scopes) : undefined;

    return this.database.run(principal, async (transaction) => {
      const existing = await transaction.enterpriseIdentityProvider.findUnique({
        where: { id: providerId },
      });
      if (!existing) throw new NotFoundException('Identity provider not found');
      const updated = await transaction.enterpriseIdentityProvider.update({
        where: { id: providerId },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(domains !== undefined ? { allowedDomains: domains } : {}),
          ...(scopes !== undefined ? { scopes } : {}),
          ...(input.emailClaim !== undefined
            ? { emailClaim: input.emailClaim.trim() || 'email' }
            : {}),
          ...(input.nameClaim !== undefined
            ? { nameClaim: input.nameClaim.trim() || 'name' }
            : {}),
          ...(role !== undefined ? { defaultRole: role } : {}),
          ...(input.enforceSso !== undefined
            ? { enforceSso: input.enforceSso }
            : {}),
          ...(input.metadata !== undefined
            ? { metadata: input.metadata as Prisma.InputJsonValue }
            : {}),
        },
      });
      await this.audit.record(transaction, principal, {
        action: 'enterprise.identity_provider.updated',
        resourceType: 'enterprise_identity_provider',
        resourceId: updated.id,
        metadata: {
          kind: updated.kind,
          name: updated.name,
          allowedDomains: updated.allowedDomains,
        },
      });
      return this.providerProjection(updated);
    });
  }

  async rotateClientSecret(
    principal: Principal,
    providerId: string,
    input: RotateEnterpriseClientSecretDto,
  ) {
    this.assertAdmin(principal);
    return this.database.run(principal, async (transaction) => {
      const existing = await transaction.enterpriseIdentityProvider.findUnique({
        where: { id: providerId },
      });
      if (!existing) throw new NotFoundException('Identity provider not found');
      if (existing.kind !== EnterpriseIdentityProviderKind.OIDC) {
        throw new BadRequestException(
          'Client-secret rotation is only supported for OIDC providers',
        );
      }
      const updated = await transaction.enterpriseIdentityProvider.update({
        where: { id: providerId },
        data: {
          clientSecretCiphertext: this.security.encryptSensitiveValue(
            input.clientSecret,
            this.clientSecretPurpose(providerId),
          ),
          lastError: null,
        },
      });
      await this.audit.record(transaction, principal, {
        action: 'enterprise.identity_provider.client_secret_rotated',
        resourceType: 'enterprise_identity_provider',
        resourceId: updated.id,
      });
      return this.providerProjection(updated);
    });
  }

  async setProviderEnabled(
    principal: Principal,
    providerId: string,
    enabled: boolean,
  ) {
    this.assertAdmin(principal);
    const existing = await this.database.run(principal, (transaction) =>
      transaction.enterpriseIdentityProvider.findUnique({
        where: { id: providerId },
      }),
    );
    if (!existing) throw new NotFoundException('Identity provider not found');
    if (enabled && existing.kind === EnterpriseIdentityProviderKind.SAML) {
      throw new BadRequestException(
        'SAML runtime is not enabled until XML-signature provider qualification is complete',
      );
    }

    let discovery: OidcDiscoveryDocument | null = null;
    if (enabled && existing.kind === EnterpriseIdentityProviderKind.OIDC) {
      if (!existing.issuer) {
        throw new BadRequestException('OIDC issuer is not configured');
      }
      discovery = await this.discoverOidc(existing.issuer);
    }

    return this.database.run(principal, async (transaction) => {
      const updated = await transaction.enterpriseIdentityProvider.update({
        where: { id: providerId },
        data: enabled
          ? {
              status: EnterpriseIdentityProviderStatus.ACTIVE,
              issuer: discovery?.issuer ?? existing.issuer,
              authorizationEndpoint:
                discovery?.authorization_endpoint ?? existing.authorizationEndpoint,
              tokenEndpoint: discovery?.token_endpoint ?? existing.tokenEndpoint,
              jwksUri: discovery?.jwks_uri ?? existing.jwksUri,
              lastValidatedAt: discovery ? new Date() : existing.lastValidatedAt,
              lastError: null,
            }
          : {
              status: EnterpriseIdentityProviderStatus.DISABLED,
            },
      });
      await this.audit.record(transaction, principal, {
        action: enabled
          ? 'enterprise.identity_provider.enabled'
          : 'enterprise.identity_provider.disabled',
        resourceType: 'enterprise_identity_provider',
        resourceId: updated.id,
      });
      return this.providerProjection(updated);
    });
  }

  async discoverByEmail(emailInput: string) {
    const email = emailInput.trim().toLowerCase();
    const separator = email.lastIndexOf('@');
    if (separator <= 0 || separator === email.length - 1) {
      throw new BadRequestException('A valid email is required');
    }
    const domain = email.slice(separator + 1);
    const providers = await this.worker.enterpriseIdentityProvider.findMany({
      where: {
        kind: EnterpriseIdentityProviderKind.OIDC,
        status: EnterpriseIdentityProviderStatus.ACTIVE,
        allowedDomains: { has: domain },
      },
      include: {
        workspace: { select: { name: true, slug: true } },
      },
      take: 10,
    });
    return providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      kind: provider.kind,
      workspace: provider.workspace,
      enforceSso: provider.enforceSso,
    }));
  }

  async startOidc(providerId: string) {
    const provider = await this.worker.enterpriseIdentityProvider.findUnique({
      where: { id: providerId },
    });
    this.assertRunnableOidc(provider);

    const stateId = randomUUID();
    const opaque = this.security.createOpaqueToken(stateId);
    const nonce = randomBytes(32).toString('base64url');
    const codeVerifier = randomBytes(48).toString('base64url');
    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    const redirectUri =
      this.config.getOrThrow<string>('WEB_APP_URL').replace(/\/$/, '') +
      '/auth/oidc/callback';

    await this.worker.oidcLoginState.create({
      data: {
        id: stateId,
        organizationId: provider!.organizationId,
        workspaceId: provider!.workspaceId,
        providerId: provider!.id,
        stateHash: opaque.tokenHash,
        nonceHash: this.security.digestToken(nonce),
        codeVerifierCiphertext: this.security.encryptSensitiveValue(
          codeVerifier,
          this.codeVerifierPurpose(stateId),
        ),
        redirectUri,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });
    await this.worker.oidcLoginState.deleteMany({
      where: {
        expiresAt: { lt: new Date(Date.now() - 60 * 60 * 1000) },
      },
    });

    const authorizationUrl = new URL(provider!.authorizationEndpoint!);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('client_id', provider!.clientId!);
    authorizationUrl.searchParams.set('redirect_uri', redirectUri);
    authorizationUrl.searchParams.set('scope', provider!.scopes.join(' '));
    authorizationUrl.searchParams.set('state', opaque.token);
    authorizationUrl.searchParams.set('nonce', nonce);
    authorizationUrl.searchParams.set('code_challenge', codeChallenge);
    authorizationUrl.searchParams.set('code_challenge_method', 'S256');

    return { authorizationUrl: authorizationUrl.toString(), expiresIn: 600 };
  }

  async completeOidc(
    input: OidcCallbackDto,
    metadata: AuthRequestMetadata,
  ) {
    const parsed = this.security.parseOpaqueToken(input.state);
    if (!parsed) throw new UnauthorizedException('OIDC state is invalid');

    const claimed = await this.worker.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${parsed.id}, 0))`;
      const state = await transaction.oidcLoginState.findUnique({
        where: { id: parsed.id },
        include: { provider: true },
      });
      if (
        !state ||
        state.consumedAt ||
        state.expiresAt <= new Date() ||
        !this.security.verifyTokenDigest(parsed.secret, state.stateHash) ||
        state.provider.status !== EnterpriseIdentityProviderStatus.ACTIVE ||
        state.provider.kind !== EnterpriseIdentityProviderKind.OIDC
      ) {
        throw new UnauthorizedException('OIDC state is invalid or expired');
      }
      await transaction.oidcLoginState.update({
        where: { id: state.id },
        data: { consumedAt: new Date() },
      });
      return state;
    });

    const provider = claimed.provider;
    this.assertRunnableOidc(provider);
    const codeVerifier = this.security.decryptSensitiveValue(
      claimed.codeVerifierCiphertext,
      this.codeVerifierPurpose(claimed.id),
    );
    const clientSecret = this.security.decryptSensitiveValue(
      provider.clientSecretCiphertext!,
      this.clientSecretPurpose(provider.id),
    );

    const token = await this.http.postForm<OidcTokenResponse>(
      provider.tokenEndpoint!,
      {
        grant_type: 'authorization_code',
        code: input.code,
        redirect_uri: claimed.redirectUri,
        client_id: provider.clientId!,
        client_secret: clientSecret,
        code_verifier: codeVerifier,
      },
    );
    if (!token.id_token) {
      throw new UnauthorizedException(
        token.error_description ?? token.error ?? 'OIDC ID token is missing',
      );
    }

    const jwks = await this.http.getJson<JsonWebKeySet>(provider.jwksUri!);
    const claims = verifyOidcIdToken({
      token: token.id_token,
      jwks,
      issuer: provider.issuer!,
      clientId: provider.clientId!,
      nonceDigest: claimed.nonceHash,
      digest: (value) => this.security.digestToken(value),
    });

    const rawEmail = claims[provider.emailClaim];
    if (typeof rawEmail !== 'string') {
      throw new UnauthorizedException('OIDC email claim is missing');
    }
    if (claims.email_verified === false) {
      throw new UnauthorizedException('OIDC email is not verified');
    }
    const email = rawEmail.trim().toLowerCase();
    this.assertEmailDomain(provider.allowedDomains, email);
    const rawName = claims[provider.nameClaim];
    const displayName =
      typeof rawName === 'string' && rawName.trim()
        ? rawName.trim().slice(0, 160)
        : email.split('@')[0]!;

    return this.auth.completeFederatedLogin(
      {
        providerId: provider.id,
        organizationId: provider.organizationId,
        workspaceId: provider.workspaceId,
        externalSubject: claims.sub,
        email,
        displayName,
        defaultRole: provider.defaultRole,
      },
      metadata,
    );
  }

  async listScimTokens(principal: Principal, providerId: string) {
    this.assertAdmin(principal);
    return this.database.run(principal, async (transaction) => {
      await this.requireProvider(transaction, providerId);
      return transaction.scimToken.findMany({
        where: { providerId },
        select: {
          id: true,
          name: true,
          prefix: true,
          status: true,
          lastUsedAt: true,
          expiresAt: true,
          revokedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  async createScimToken(
    principal: Principal,
    providerId: string,
    input: CreateScimTokenDto,
  ) {
    this.assertAdmin(principal);
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expiresAt && expiresAt <= new Date()) {
      throw new BadRequestException('SCIM token expiry must be in the future');
    }
    const prefix = randomBytes(6).toString('hex');
    const secret = randomBytes(32).toString('base64url');
    const raw = `scim_${prefix}_${secret}`;

    const token = await this.database.run(principal, async (transaction) => {
      await this.requireProvider(transaction, providerId);
      const created = await transaction.scimToken.create({
        data: {
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          providerId,
          createdById: principal.userId,
          name: input.name.trim(),
          prefix,
          secretHash: this.security.digestToken(raw),
          expiresAt,
        },
      });
      await this.audit.record(transaction, principal, {
        action: 'enterprise.scim_token.created',
        resourceType: 'scim_token',
        resourceId: created.id,
        metadata: { providerId, prefix },
      });
      return created;
    });
    return {
      id: token.id,
      name: token.name,
      prefix: token.prefix,
      expiresAt: token.expiresAt,
      createdAt: token.createdAt,
      secret: raw,
    };
  }

  async revokeScimToken(principal: Principal, tokenId: string) {
    this.assertAdmin(principal);
    return this.database.run(principal, async (transaction) => {
      const token = await transaction.scimToken.findUnique({
        where: { id: tokenId },
      });
      if (!token) throw new NotFoundException('SCIM token not found');
      const updated = await transaction.scimToken.update({
        where: { id: token.id },
        data: {
          status: ScimTokenStatus.REVOKED,
          revokedAt: token.revokedAt ?? new Date(),
        },
      });
      await this.audit.record(transaction, principal, {
        action: 'enterprise.scim_token.revoked',
        resourceType: 'scim_token',
        resourceId: updated.id,
        metadata: { providerId: updated.providerId, prefix: updated.prefix },
      });
      return { id: updated.id, revoked: true };
    });
  }

  private async discoverOidc(issuerInput: string): Promise<OidcDiscoveryDocument> {
    const issuer = issuerInput.trim().replace(/\/$/, '');
    const discovery = await this.http.getJson<OidcDiscoveryDocument>(
      `${issuer}/.well-known/openid-configuration`,
    );
    if (
      discovery.issuer.replace(/\/$/, '') !== issuer ||
      !discovery.authorization_endpoint ||
      !discovery.token_endpoint ||
      !discovery.jwks_uri
    ) {
      throw new BadRequestException('OIDC discovery document is invalid');
    }
    if (
      discovery.code_challenge_methods_supported &&
      !discovery.code_challenge_methods_supported.includes('S256')
    ) {
      throw new BadRequestException('OIDC provider does not support PKCE S256');
    }
    const jwks = await this.http.getJson<JsonWebKeySet>(discovery.jwks_uri);
    if (!Array.isArray(jwks.keys) || jwks.keys.length === 0) {
      throw new BadRequestException('OIDC JWKS is empty');
    }
    return { ...discovery, issuer };
  }

  private assertRunnableOidc(
    provider:
      | {
          kind: EnterpriseIdentityProviderKind;
          status: EnterpriseIdentityProviderStatus;
          issuer: string | null;
          clientId: string | null;
          clientSecretCiphertext: string | null;
          authorizationEndpoint: string | null;
          tokenEndpoint: string | null;
          jwksUri: string | null;
        }
      | null,
  ): asserts provider is NonNullable<typeof provider> {
    if (
      !provider ||
      provider.kind !== EnterpriseIdentityProviderKind.OIDC ||
      provider.status !== EnterpriseIdentityProviderStatus.ACTIVE ||
      !provider.issuer ||
      !provider.clientId ||
      !provider.clientSecretCiphertext ||
      !provider.authorizationEndpoint ||
      !provider.tokenEndpoint ||
      !provider.jwksUri
    ) {
      throw new NotFoundException('OIDC provider is unavailable');
    }
  }

  private providerProjection(provider: {
    id: string;
    kind: EnterpriseIdentityProviderKind;
    name: string;
    status: EnterpriseIdentityProviderStatus;
    issuer: string | null;
    clientId: string | null;
    scopes: string[];
    allowedDomains: string[];
    emailClaim: string;
    nameClaim: string;
    defaultRole: WorkspaceRole;
    enforceSso: boolean;
    metadata: Prisma.JsonValue;
    lastValidatedAt: Date | null;
    lastError: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: provider.id,
      kind: provider.kind,
      name: provider.name,
      status: provider.status,
      issuer: provider.issuer,
      clientId: provider.clientId,
      scopes: provider.scopes,
      allowedDomains: provider.allowedDomains,
      emailClaim: provider.emailClaim,
      nameClaim: provider.nameClaim,
      defaultRole: provider.defaultRole,
      enforceSso: provider.enforceSso,
      metadata: provider.metadata,
      lastValidatedAt: provider.lastValidatedAt,
      lastError: provider.lastError,
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
    };
  }

  private async requireProvider(
    transaction: Prisma.TransactionClient,
    providerId: string,
  ) {
    const provider = await transaction.enterpriseIdentityProvider.findUnique({
      where: { id: providerId },
    });
    if (!provider) throw new NotFoundException('Identity provider not found');
    return provider;
  }

  private normalizeDomains(values: string[]): string[] {
    const domains = [...new Set(values.map((value) =>
      value.trim().toLowerCase().replace(/^@/, '').replace(/\.$/, ''),
    ).filter(Boolean))];
    if (domains.length === 0) {
      throw new BadRequestException('At least one allowed email domain is required');
    }
    if (
      domains.some(
        (domain) =>
          domain.length > 253 ||
          !domain.includes('.') ||
          !/^[a-z0-9.-]+$/.test(domain),
      )
    ) {
      throw new BadRequestException('Allowed email domains are invalid');
    }
    return domains;
  }

  private normalizeScopes(values: string[]): string[] {
    const scopes = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
    for (const required of ['openid', 'email']) {
      if (!scopes.includes(required)) scopes.unshift(required);
    }
    if (
      scopes.length > 20 ||
      scopes.some((scope) => scope.length > 100 || /\s/.test(scope))
    ) {
      throw new BadRequestException('OIDC scopes are invalid');
    }
    return scopes;
  }

  private assertEmailDomain(allowedDomains: string[], email: string): void {
    const domain = email.slice(email.lastIndexOf('@') + 1);
    if (!domain || !allowedDomains.includes(domain)) {
      throw new ForbiddenException('Email domain is not authorized for this provider');
    }
  }

  private assertSafeJitRole(role: WorkspaceRole): void {
    if (!JIT_ALLOWED_ROLES.has(role)) {
      throw new BadRequestException(
        'Enterprise JIT default role must be MEMBER, HOST, or ANALYST',
      );
    }
  }

  private assertAdmin(principal: Principal): void {
    if (!hasAnyRole(principal, ADMIN_ROLES)) {
      throw new ForbiddenException('An owner or admin role is required');
    }
  }

  private clientSecretPurpose(providerId: string): string {
    return `enterprise-idp-client:${providerId}`;
  }

  private codeVerifierPurpose(stateId: string): string {
    return `oidc-code-verifier:${stateId}`;
  }
}
