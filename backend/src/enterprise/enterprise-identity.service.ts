import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, UserStatus, WorkspaceRole } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { ADMIN_ROLES, hasAnyRole, type Principal } from '../common/auth/principal';
import { SecurityService } from '../auth/security.service';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { WorkerPrismaService } from '../database/worker-prisma.service';

type IdentityConnectionRow = {
  id: string;
  protocol: 'OIDC' | 'SAML';
  enabled: boolean;
  enforce_sso: boolean;
  issuer_url: string | null;
  client_id: string | null;
  encrypted_client_secret: string | null;
  authorization_endpoint: string | null;
  token_endpoint: string | null;
  userinfo_endpoint: string | null;
  jwks_uri: string | null;
  scopes: string[];
  email_domains: string[];
  role_attribute: string | null;
  default_role: WorkspaceRole;
  created_at: Date;
  updated_at: Date;
};

export interface UpsertEnterpriseIdentityInput {
  protocol: 'OIDC' | 'SAML';
  enabled?: boolean;
  enforceSso?: boolean;
  issuerUrl?: string | null;
  clientId?: string | null;
  clientSecret?: string | null;
  authorizationEndpoint?: string | null;
  tokenEndpoint?: string | null;
  userinfoEndpoint?: string | null;
  jwksUri?: string | null;
  scopes?: string[];
  emailDomains?: string[];
  roleAttribute?: string | null;
  defaultRole?: WorkspaceRole;
}

@Injectable()
export class EnterpriseIdentityService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly worker: WorkerPrismaService,
    private readonly security: SecurityService,
    private readonly audit: AuditService,
  ) {}

  async getConnection(principal: Principal) {
    this.assertAdmin(principal);
    return this.database.run(principal, async (transaction) => {
      const rows = await transaction.$queryRaw<IdentityConnectionRow[]>`
        SELECT * FROM enterprise_identity_connections LIMIT 1
      `;
      return rows[0] ? this.connectionShape(rows[0]) : null;
    });
  }

  async upsertConnection(principal: Principal, input: UpsertEnterpriseIdentityInput) {
    this.assertAdmin(principal);
    this.validateConnection(input);
    return this.database.run(principal, async (transaction) => {
      const existing = await transaction.$queryRaw<IdentityConnectionRow[]>`
        SELECT * FROM enterprise_identity_connections LIMIT 1
      `;
      const current = existing[0];
      const encryptedSecret =
        input.clientSecret && input.clientSecret.trim()
          ? this.security.encryptSensitiveValue(input.clientSecret.trim(), 'enterprise-oidc-client-secret')
          : current?.encrypted_client_secret ?? null;
      const scopes = input.scopes?.length ? [...new Set(input.scopes.map((item) => item.trim()).filter(Boolean))] : current?.scopes ?? ['openid','profile','email'];
      const emailDomains = input.emailDomains ? this.normalizeDomains(input.emailDomains) : current?.email_domains ?? [];
      const rows = await transaction.$queryRaw<IdentityConnectionRow[]>`
        INSERT INTO enterprise_identity_connections (
          organization_id, workspace_id, protocol, enabled, enforce_sso, issuer_url, client_id, encrypted_client_secret,
          authorization_endpoint, token_endpoint, userinfo_endpoint, jwks_uri, scopes, email_domains, role_attribute, default_role
        ) VALUES (
          ${principal.organizationId}::uuid, ${principal.workspaceId}::uuid, ${input.protocol},
          ${input.enabled ?? false}, ${input.enforceSso ?? false}, ${this.nullable(input.issuerUrl)}, ${this.nullable(input.clientId)}, ${encryptedSecret},
          ${this.nullable(input.authorizationEndpoint)}, ${this.nullable(input.tokenEndpoint)}, ${this.nullable(input.userinfoEndpoint)},
          ${this.nullable(input.jwksUri)}, ${JSON.stringify(scopes)}::jsonb, ${JSON.stringify(emailDomains)}::jsonb,
          ${this.nullable(input.roleAttribute)}, ${input.defaultRole ?? current?.default_role ?? WorkspaceRole.MEMBER}
        )
        ON CONFLICT (workspace_id) DO UPDATE SET
          protocol = EXCLUDED.protocol, enabled = EXCLUDED.enabled, enforce_sso = EXCLUDED.enforce_sso,
          issuer_url = EXCLUDED.issuer_url, client_id = EXCLUDED.client_id, encrypted_client_secret = EXCLUDED.encrypted_client_secret,
          authorization_endpoint = EXCLUDED.authorization_endpoint, token_endpoint = EXCLUDED.token_endpoint,
          userinfo_endpoint = EXCLUDED.userinfo_endpoint, jwks_uri = EXCLUDED.jwks_uri, scopes = EXCLUDED.scopes,
          email_domains = EXCLUDED.email_domains, role_attribute = EXCLUDED.role_attribute, default_role = EXCLUDED.default_role,
          updated_at = NOW()
        RETURNING *
      `;
      const saved = rows[0];
      if (!saved) throw new Error('enterprise_identity_connection_invariant');
      await this.audit.record(transaction, principal, {
        action: 'enterprise.identity.updated',
        resourceType: 'enterprise_identity_connection',
        resourceId: saved.id,
        metadata: { protocol: saved.protocol, enabled: saved.enabled, enforceSso: saved.enforce_sso },
      });
      return this.connectionShape(saved);
    });
  }

  async listScimTokens(principal: Principal) {
    this.assertAdmin(principal);
    return this.database.run(principal, (transaction) => transaction.$queryRaw<Array<{
      id: string; name: string; key_prefix: string; last_used_at: Date | null; expires_at: Date | null; revoked_at: Date | null; created_at: Date;
    }>>`
      SELECT id, name, key_prefix, last_used_at, expires_at, revoked_at, created_at
      FROM scim_tokens ORDER BY created_at DESC
    `);
  }

  async createScimToken(principal: Principal, name: string, expiresAt?: string | null) {
    this.assertAdmin(principal);
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 120) throw new BadRequestException('SCIM token name must be 2-120 characters');
    const expiry = expiresAt ? new Date(expiresAt) : null;
    if (expiry && (Number.isNaN(expiry.getTime()) || expiry <= new Date())) throw new BadRequestException('SCIM token expiry must be in the future');
    const secret = `scim_sessions_${randomBytes(32).toString('base64url')}`;
    const hash = createHash('sha256').update(secret).digest('hex');
    const prefix = secret.slice(0, 24);
    return this.database.run(principal, async (transaction) => {
      const rows = await transaction.$queryRaw<Array<{ id: string; created_at: Date }>>`
        INSERT INTO scim_tokens (organization_id, workspace_id, name, key_prefix, token_hash, expires_at)
        VALUES (${principal.organizationId}::uuid, ${principal.workspaceId}::uuid, ${trimmed}, ${prefix}, ${hash}, ${expiry})
        RETURNING id, created_at
      `;
      const created = rows[0];
      if (!created) throw new Error('scim_token_invariant');
      await this.audit.record(transaction, principal, {
        action: 'enterprise.scim_token.created', resourceType: 'scim_token', resourceId: created.id, metadata: { name: trimmed },
      });
      return { id: created.id, name: trimmed, keyPrefix: prefix, token: secret, expiresAt: expiry, createdAt: created.created_at };
    });
  }

  async revokeScimToken(principal: Principal, id: string) {
    this.assertAdmin(principal);
    return this.database.run(principal, async (transaction) => {
      const count = await transaction.$executeRaw`UPDATE scim_tokens SET revoked_at = NOW() WHERE id = ${id}::uuid AND revoked_at IS NULL`;
      if (!count) throw new NotFoundException('SCIM token not found');
      await this.audit.record(transaction, principal, { action: 'enterprise.scim_token.revoked', resourceType: 'scim_token', resourceId: id });
      return { id, revoked: true };
    });
  }

  async scimListUsers(authorization: string | undefined) {
    const tenant = await this.authenticateScim(authorization);
    const memberships = await this.worker.workspaceMembership.findMany({
      where: { organizationId: tenant.organizationId, workspaceId: tenant.workspaceId },
      include: { user: true },
      orderBy: { user: { email: 'asc' } },
      take: 500,
    });
    const identities = await this.worker.$queryRaw<Array<{ user_id: string; external_id: string }>>`
      SELECT user_id, external_id FROM scim_external_identities WHERE workspace_id = ${tenant.workspaceId}::uuid
    `;
    const external = new Map(identities.map((item) => [item.user_id, item.external_id]));
    return { schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'], totalResults: memberships.length, startIndex: 1, itemsPerPage: memberships.length, Resources: memberships.map((membership) => this.scimUser(membership.user, external.get(membership.userId), membership.role)) };
  }

  async scimCreateUser(authorization: string | undefined, input: { externalId?: string; userName: string; active?: boolean; displayName?: string; name?: { formatted?: string } }) {
    const tenant = await this.authenticateScim(authorization);
    const email = input.userName?.trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new BadRequestException('SCIM userName must be an email address');
    const connection = await this.worker.$queryRaw<IdentityConnectionRow[]>`SELECT * FROM enterprise_identity_connections WHERE workspace_id = ${tenant.workspaceId}::uuid LIMIT 1`;
    const policy = connection[0];
    if (policy?.email_domains?.length) {
      const domain = email.split('@')[1] ?? '';
      if (!policy.email_domains.includes(domain)) throw new ForbiddenException('Email domain is not allowed by enterprise identity policy');
    }
    const externalId = input.externalId?.trim() || email;
    return this.worker.$transaction(async (transaction) => {
      const duplicate = await transaction.$queryRaw<Array<{ user_id: string }>>`SELECT user_id FROM scim_external_identities WHERE workspace_id = ${tenant.workspaceId}::uuid AND external_id = ${externalId} LIMIT 1`;
      if (duplicate[0]) throw new ConflictException('SCIM externalId already exists');
      const displayName =
        input.displayName?.trim() ||
        input.name?.formatted?.trim() ||
        email.split('@')[0] ||
        email;
      const requestedDisplayName =
        input.displayName?.trim() || input.name?.formatted?.trim();
      const user = await transaction.user.upsert({
        where: { email },
        create: {
          email,
          displayName,
          passwordHash: null,
          status: input.active === false ? UserStatus.SUSPENDED : UserStatus.ACTIVE,
          emailVerifiedAt: new Date(),
        },
        update: {
          ...(requestedDisplayName ? { displayName: requestedDisplayName } : {}),
        },
      });
      const role = policy?.default_role ?? WorkspaceRole.MEMBER;
      const membership = await transaction.workspaceMembership.upsert({
        where: { workspaceId_userId: { workspaceId: tenant.workspaceId, userId: user.id } },
        create: { organizationId: tenant.organizationId, workspaceId: tenant.workspaceId, userId: user.id, role },
        update: { role },
      });
      await transaction.$executeRaw`INSERT INTO scim_external_identities (organization_id, workspace_id, user_id, external_id) VALUES (${tenant.organizationId}::uuid, ${tenant.workspaceId}::uuid, ${user.id}::uuid, ${externalId}) ON CONFLICT (workspace_id, user_id) DO UPDATE SET external_id = EXCLUDED.external_id, updated_at = NOW()`;
      return this.scimUser(user, externalId, membership.role);
    });
  }

  async scimPatchUser(authorization: string | undefined, userId: string, input: { Operations?: Array<{ op?: string; path?: string; value?: unknown }> }) {
    const tenant = await this.authenticateScim(authorization);
    const membership = await this.worker.workspaceMembership.findFirst({ where: { workspaceId: tenant.workspaceId, organizationId: tenant.organizationId, userId }, include: { user: true } });
    if (!membership) throw new NotFoundException('SCIM user not found');
    let displayName: string | undefined;
    let active: boolean | undefined;
    for (const operation of input.Operations ?? []) {
      const path = operation.path?.toLowerCase();
      if (path === 'displayname' && typeof operation.value === 'string') displayName = operation.value.trim();
      if (path === 'active' && typeof operation.value === 'boolean') active = operation.value;
      if (!path && operation.value && typeof operation.value === 'object') {
        const value = operation.value as Record<string, unknown>;
        if (typeof value.displayName === 'string') displayName = value.displayName.trim();
        if (typeof value.active === 'boolean') active = value.active;
      }
    }
    const user = displayName ? await this.worker.user.update({ where: { id: userId }, data: { displayName } }) : membership.user;
    if (active === false) {
      await this.worker.workspaceMembership.delete({ where: { workspaceId_userId: { workspaceId: tenant.workspaceId, userId } } });
    }
    const ext = await this.worker.$queryRaw<Array<{ external_id: string }>>`SELECT external_id FROM scim_external_identities WHERE workspace_id = ${tenant.workspaceId}::uuid AND user_id = ${userId}::uuid LIMIT 1`;
    return this.scimUser(user, ext[0]?.external_id, membership.role, active !== false);
  }

  private async authenticateScim(authorization: string | undefined) {
    if (!authorization?.startsWith('Bearer scim_sessions_')) throw new UnauthorizedException('A valid SCIM bearer token is required');
    const token = authorization.slice('Bearer '.length).trim();
    const hash = createHash('sha256').update(token).digest('hex');
    const rows = await this.worker.$queryRaw<Array<{ id: string; organization_id: string; workspace_id: string }>>`
      UPDATE scim_tokens SET last_used_at = NOW()
      WHERE token_hash = ${hash} AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())
      RETURNING id, organization_id, workspace_id
    `;
    const row = rows[0];
    if (!row) throw new UnauthorizedException('SCIM token is invalid, expired, or revoked');
    return { tokenId: row.id, organizationId: row.organization_id, workspaceId: row.workspace_id };
  }

  private scimUser(user: { id: string; email: string; displayName: string; status: UserStatus }, externalId: string | undefined, role: WorkspaceRole, active = true) {
    return { schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'], id: user.id, externalId: externalId ?? user.email, userName: user.email, displayName: user.displayName, active: active && user.status === UserStatus.ACTIVE, roles: [{ value: role }], meta: { resourceType: 'User' } };
  }

  private connectionShape(row: IdentityConnectionRow) {
    return { id: row.id, protocol: row.protocol, enabled: row.enabled, enforceSso: row.enforce_sso, issuerUrl: row.issuer_url, clientId: row.client_id, hasClientSecret: Boolean(row.encrypted_client_secret), authorizationEndpoint: row.authorization_endpoint, tokenEndpoint: row.token_endpoint, userinfoEndpoint: row.userinfo_endpoint, jwksUri: row.jwks_uri, scopes: row.scopes, emailDomains: row.email_domains, roleAttribute: row.role_attribute, defaultRole: row.default_role, createdAt: row.created_at, updatedAt: row.updated_at };
  }

  private validateConnection(input: UpsertEnterpriseIdentityInput) {
    if (input.protocol === 'OIDC' && input.enabled) {
      for (const [label, value] of [['issuerUrl', input.issuerUrl], ['clientId', input.clientId], ['authorizationEndpoint', input.authorizationEndpoint], ['tokenEndpoint', input.tokenEndpoint], ['jwksUri', input.jwksUri]] as const) {
        if (!value?.trim()) throw new BadRequestException(`${label} is required when OIDC is enabled`);
      }
    }
    for (const value of [input.issuerUrl, input.authorizationEndpoint, input.tokenEndpoint, input.userinfoEndpoint, input.jwksUri]) {
      if (!value) continue;
      let url: URL;
      try { url = new URL(value); } catch { throw new BadRequestException('Enterprise identity URLs must be valid HTTPS URLs'); }
      if (url.protocol !== 'https:') throw new BadRequestException('Enterprise identity URLs must use HTTPS');
    }
    if (input.defaultRole === WorkspaceRole.OWNER) throw new BadRequestException('SCIM/SSO default role cannot be OWNER');
  }

  private normalizeDomains(domains: string[]) {
    return [...new Set(domains.map((item) => item.trim().toLowerCase()).filter((item) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(item)))];
  }
  private nullable(value?: string | null) { const trimmed = value?.trim(); return trimmed || null; }
  private assertAdmin(principal: Principal) { if (!hasAnyRole(principal, ADMIN_ROLES)) throw new ForbiddenException('Owner or admin role is required'); }
}