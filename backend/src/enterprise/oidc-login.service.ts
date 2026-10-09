import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserStatus, WorkspaceRole } from '@prisma/client';
import { createHash, createPublicKey, randomBytes, randomUUID, verify as verifySignature } from 'node:crypto';
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { AuthService, type AuthRequestMetadata } from '../auth/auth.service';
import { SecurityService } from '../auth/security.service';
import { WorkerPrismaService } from '../database/worker-prisma.service';

type OidcConnection = {
  organization_id: string;
  workspace_id: string;
  issuer_url: string;
  client_id: string;
  encrypted_client_secret: string | null;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string | null;
  jwks_uri: string;
  scopes: string[];
  email_domains: string[];
  default_role: WorkspaceRole;
};

type JwtHeader = { alg?: string; kid?: string; typ?: string };
type IdTokenClaims = {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
  nonce?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  preferred_username?: string;
};

@Injectable()
export class OidcLoginService {
  constructor(
    private readonly prisma: WorkerPrismaService,
    private readonly security: SecurityService,
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  async start(workspaceSlug: string, returnTo?: string) {
    const workspace = await this.prisma.workspace.findFirst({
      where: { slug: workspaceSlug.trim().toLowerCase() },
      select: { id: true, organizationId: true },
    });
    if (!workspace) throw new BadRequestException('Enterprise workspace was not found');
    const connection = await this.connectionForWorkspace(workspace.id);
    if (!connection) throw new BadRequestException('OIDC is not enabled for this workspace');

    const state = randomBytes(32).toString('base64url');
    const nonce = randomBytes(32).toString('base64url');
    const verifier = randomBytes(64).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const id = randomUUID();
    const safeReturnTo = this.safeReturnTo(returnTo);
    await this.prisma.$executeRaw`
      INSERT INTO oidc_login_requests (
        id, organization_id, workspace_id, state_hash, nonce_hash, encrypted_code_verifier, return_to, expires_at
      ) VALUES (
        ${id}::uuid, ${workspace.organizationId}::uuid, ${workspace.id}::uuid,
        ${this.security.digestToken(state)}, ${this.security.digestToken(nonce)},
        ${this.security.encryptSensitiveValue(verifier, 'oidc-code-verifier')},
        ${safeReturnTo}, NOW() + INTERVAL '10 minutes'
      )
    `;

    const query = new URLSearchParams({
      response_type: 'code',
      client_id: connection.client_id,
      redirect_uri: this.redirectUri(),
      scope: connection.scopes.join(' '),
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    return { authorizationUrl: `${connection.authorization_endpoint}?${query.toString()}` };
  }

  async callback(state: string | undefined, code: string | undefined) {
    if (!state || !code) throw new BadRequestException('OIDC callback is missing state or code');
    const stateHash = this.security.digestToken(state);
    const requests = await this.prisma.$queryRaw<Array<{
      id: string; organization_id: string; workspace_id: string; nonce_hash: string;
      encrypted_code_verifier: string; return_to: string | null;
    }>>`
      UPDATE oidc_login_requests
      SET consumed_at = NOW()
      WHERE state_hash = ${stateHash}
        AND consumed_at IS NULL
        AND expires_at > NOW()
      RETURNING id, organization_id, workspace_id, nonce_hash, encrypted_code_verifier, return_to
    `;
    const request = requests[0];
    if (!request) throw new UnauthorizedException('OIDC state is invalid, expired, or already used');
    const connection = await this.connectionForWorkspace(request.workspace_id);
    if (!connection) throw new UnauthorizedException('OIDC is no longer enabled for this workspace');
    const verifier = this.security.decryptSensitiveValue(request.encrypted_code_verifier, 'oidc-code-verifier');
    const tokens = await this.exchangeCode(connection, code, verifier);
    const claims = await this.verifyIdToken(connection, tokens.id_token, request.nonce_hash);
    const user = await this.resolveUser(connection, claims);

    const grantId = randomUUID();
    const grantSecret = randomBytes(32).toString('base64url');
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`
        INSERT INTO oidc_login_grants (
          id, organization_id, workspace_id, user_id, grant_hash, expires_at
        ) VALUES (
          ${grantId}::uuid, ${connection.organization_id}::uuid, ${connection.workspace_id}::uuid,
          ${user.id}::uuid, ${this.security.digestToken(grantSecret)}, NOW() + INTERVAL '2 minutes'
        )
      `;
      await transaction.auditEvent.create({
        data: {
          organizationId: connection.organization_id,
          workspaceId: connection.workspace_id,
          actorUserId: user.id,
          action: 'auth.oidc.callback_succeeded',
          resourceType: 'user',
          resourceId: user.id,
          metadata: { issuer: connection.issuer_url },
        },
      });
    });
    const grant = `${grantId}.${grantSecret}`;
    const target = new URL('/auth/sso/callback', this.config.getOrThrow<string>('WEB_APP_URL'));
    target.searchParams.set('grant', grant);
    if (request.return_to) target.searchParams.set('returnTo', request.return_to);
    return target.toString();
  }

  async exchangeGrant(grant: string, metadata: AuthRequestMetadata) {
    const parsed = this.security.parseOpaqueToken(grant);
    if (!parsed) throw new UnauthorizedException('OIDC login grant is invalid');
    const rows = await this.prisma.$queryRaw<Array<{ user_id: string; workspace_id: string }>>`
      UPDATE oidc_login_grants
      SET consumed_at = NOW()
      WHERE id = ${parsed.id}::uuid
        AND grant_hash = ${this.security.digestToken(parsed.secret)}
        AND consumed_at IS NULL
        AND expires_at > NOW()
      RETURNING user_id, workspace_id
    `;
    const row = rows[0];
    if (!row) throw new UnauthorizedException('OIDC login grant is invalid, expired, or already used');
    return this.auth.createExternalIdentitySession(row.user_id, row.workspace_id, metadata);
  }

  private async connectionForWorkspace(workspaceId: string): Promise<OidcConnection | null> {
    const rows = await this.prisma.$queryRaw<OidcConnection[]>`
      SELECT organization_id, workspace_id, issuer_url, client_id, encrypted_client_secret,
             authorization_endpoint, token_endpoint, userinfo_endpoint, jwks_uri, scopes, email_domains, default_role
      FROM enterprise_identity_connections
      WHERE workspace_id = ${workspaceId}::uuid
        AND enabled = TRUE
        AND protocol = 'OIDC'
      LIMIT 1
    `;
    const row = rows[0];
    if (!row || !row.issuer_url || !row.client_id || !row.authorization_endpoint || !row.token_endpoint || !row.jwks_uri) return null;
    return row;
  }

  private async exchangeCode(connection: OidcConnection, code: string, verifier: string) {
    await this.assertPublicHttpsUrl(connection.token_endpoint);
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri(),
      client_id: connection.client_id,
      code_verifier: verifier,
    });
    if (connection.encrypted_client_secret) {
      body.set('client_secret', this.security.decryptSensitiveValue(connection.encrypted_client_secret, 'enterprise-oidc-client-secret'));
    }
    const response = await fetch(connection.token_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body,
      signal: AbortSignal.timeout(10_000),
      redirect: 'error',
    });
    if (!response.ok) throw new UnauthorizedException('OIDC token exchange failed');
    const payload = (await response.json()) as { id_token?: string };
    if (!payload.id_token) throw new UnauthorizedException('OIDC provider did not return an ID token');
    return { id_token: payload.id_token };
  }

  private async verifyIdToken(connection: OidcConnection, token: string, expectedNonceHash: string) {
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) throw new UnauthorizedException('OIDC ID token is malformed');
    const header = this.decodeJson<JwtHeader>(parts[0]);
    const claims = this.decodeJson<IdTokenClaims>(parts[1]);
    if (header.alg !== 'RS256' || !header.kid) throw new UnauthorizedException('OIDC ID token algorithm is not supported');
    await this.assertPublicHttpsUrl(connection.jwks_uri);
    const response = await fetch(connection.jwks_uri, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
      redirect: 'error',
    });
    if (!response.ok) throw new UnauthorizedException('OIDC JWKS retrieval failed');
    const jwks = (await response.json()) as { keys?: Array<Record<string, unknown>> };
    const jwk = jwks.keys?.find((item) => item.kid === header.kid);
    if (!jwk) throw new UnauthorizedException('OIDC signing key was not found');
    const kty = typeof jwk.kty === 'string' ? jwk.kty : '';
    const n = typeof jwk.n === 'string' ? jwk.n : '';
    const e = typeof jwk.e === 'string' ? jwk.e : '';
    if (kty !== 'RSA' || !n || !e) {
      throw new UnauthorizedException('OIDC signing key is not a valid RSA key');
    }
    let publicKey;
    try {
      publicKey = createPublicKey({ key: { kty, n, e }, format: 'jwk' });
    } catch {
      throw new UnauthorizedException('OIDC signing key is invalid');
    }
    const valid = verifySignature('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), publicKey, Buffer.from(parts[2], 'base64url'));
    if (!valid) throw new UnauthorizedException('OIDC ID token signature is invalid');
    const now = Math.floor(Date.now() / 1000);
    if (claims.iss !== connection.issuer_url) throw new UnauthorizedException('OIDC issuer does not match');
    const audiences = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : [];
    if (!audiences.includes(connection.client_id)) throw new UnauthorizedException('OIDC audience does not match');
    if (!claims.exp || claims.exp <= now || (claims.nbf && claims.nbf > now + 60)) throw new UnauthorizedException('OIDC ID token is expired or not active');
    if (!claims.nonce || !this.security.verifyTokenDigest(claims.nonce, expectedNonceHash)) throw new UnauthorizedException('OIDC nonce does not match');
    if (!claims.sub || !claims.email) throw new UnauthorizedException('OIDC ID token is missing subject or email');
    if (claims.email_verified === false) throw new UnauthorizedException('OIDC email is not verified');
    return claims as Required<Pick<IdTokenClaims, 'sub' | 'email'>> & IdTokenClaims;
  }

  private async resolveUser(connection: OidcConnection, claims: Required<Pick<IdTokenClaims, 'sub' | 'email'>> & IdTokenClaims) {
    const email = claims.email.trim().toLowerCase();
    const domain = email.split('@')[1] ?? '';
    if (connection.email_domains.length && !connection.email_domains.includes(domain)) throw new ForbiddenException('Email domain is not allowed for this workspace');
    return this.prisma.$transaction(async (transaction) => {
      const identities = await transaction.$queryRaw<Array<{ user_id: string }>>`
        SELECT user_id FROM enterprise_oidc_identities
        WHERE workspace_id = ${connection.workspace_id}::uuid
          AND issuer = ${connection.issuer_url}
          AND subject = ${claims.sub}
        LIMIT 1
      `;
      let user = identities[0]?.user_id
        ? await transaction.user.findUnique({ where: { id: identities[0].user_id } })
        : await transaction.user.findUnique({ where: { email } });
      if (!user) {
        user = await transaction.user.create({
          data: { email, displayName: claims.name?.trim() || claims.preferred_username?.trim() || email.split('@')[0] || email, passwordHash: null, status: UserStatus.ACTIVE, emailVerifiedAt: new Date() },
        });
      }
      if (user.status !== UserStatus.ACTIVE) throw new ForbiddenException('Enterprise user account is not active');
      await transaction.workspaceMembership.upsert({
        where: { workspaceId_userId: { workspaceId: connection.workspace_id, userId: user.id } },
        create: { organizationId: connection.organization_id, workspaceId: connection.workspace_id, userId: user.id, role: connection.default_role },
        update: {},
      });
      await transaction.$executeRaw`
        INSERT INTO enterprise_oidc_identities (organization_id, workspace_id, user_id, issuer, subject, email)
        VALUES (${connection.organization_id}::uuid, ${connection.workspace_id}::uuid, ${user.id}::uuid, ${connection.issuer_url}, ${claims.sub}, ${email})
        ON CONFLICT (workspace_id, issuer, subject)
        DO UPDATE SET user_id = EXCLUDED.user_id, email = EXCLUDED.email, updated_at = NOW()
      `;
      return user;
    });
  }

  private decodeJson<T>(value: string): T {
    try { return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T; }
    catch { throw new UnauthorizedException('OIDC token payload is invalid'); }
  }

  private redirectUri() {
    return new URL('/v1/enterprise/sso/callback', this.config.getOrThrow<string>('PUBLIC_API_URL')).toString();
  }

  private safeReturnTo(value?: string) {
    if (!value) return '/';
    const trimmed = value.trim();
    return trimmed.startsWith('/') && !trimmed.startsWith('//') ? trimmed.slice(0, 500) : '/';
  }

  private async assertPublicHttpsUrl(value: string) {
    let url: URL;
    try { url = new URL(value); } catch { throw new BadRequestException('OIDC provider endpoint is invalid'); }
    if (url.protocol !== 'https:' || url.username || url.password) throw new BadRequestException('OIDC provider endpoint must use HTTPS without embedded credentials');
    const addresses = isIP(url.hostname) ? [{ address: url.hostname }] : await lookup(url.hostname, { all: true });
    if (!addresses.length || addresses.some(({ address }) => this.isPrivateAddress(address))) throw new BadRequestException('OIDC provider endpoint resolves to a private or unsafe address');
  }

  private isPrivateAddress(address: string) {
    if (address === '::1' || address === '::' || address.startsWith('fe80:') || address.startsWith('fc') || address.startsWith('fd')) return true;
    const mapped = address.toLowerCase().startsWith('::ffff:') ? address.slice(7) : address;
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(mapped)) return false;
    const parts = mapped.split('.').map(Number);
    const [a=0,b=0] = parts;
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
}