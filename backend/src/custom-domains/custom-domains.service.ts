import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { resolveCname, resolveTxt } from 'node:dns/promises';
import { AuditService } from '../audit/audit.service';
import { ADMIN_ROLES, hasAnyRole, type Principal } from '../common/auth/principal';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { CreateCustomDomainDto } from './custom-domains.dto';

type DomainRow = {
  id: string;
  hostname: string;
  verification_token: string;
  status: string;
  tls_status: string;
  verified_at: Date | null;
  last_checked_at: Date | null;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class CustomDomainsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  async list(principal: Principal) {
    this.assertAdmin(principal);
    const target = this.targetHostname();
    const rows = await this.database.run(principal, (tx) =>
      tx.$queryRaw<DomainRow[]>`
        SELECT id, hostname, verification_token, status, tls_status, verified_at,
               last_checked_at, last_error, created_at, updated_at
        FROM custom_domains
        ORDER BY created_at DESC
      `,
    );
    return rows.map((row) => this.shape(row, target));
  }

  async create(principal: Principal, input: CreateCustomDomainDto) {
    this.assertAdmin(principal);
    const hostname = this.normalizeHostname(input.hostname);
    const token = 'sessions-domain-' + randomBytes(24).toString('base64url');
    const target = this.targetHostname();

    return this.database.run(principal, async (tx) => {
      const rows = await tx.$queryRaw<DomainRow[]>`
        INSERT INTO custom_domains (
          organization_id, workspace_id, created_by_id, hostname, verification_token
        ) VALUES (
          ${principal.organizationId}::uuid,
          ${principal.workspaceId}::uuid,
          ${principal.userId}::uuid,
          ${hostname},
          ${token}
        )
        RETURNING id, hostname, verification_token, status, tls_status, verified_at,
                  last_checked_at, last_error, created_at, updated_at
      `;
      const created = rows[0];
      if (!created) throw new Error('Custom domain creation did not return a row');
      await this.audit.record(tx, principal, {
        action: 'custom_domain.created',
        resourceType: 'custom_domain',
        resourceId: created.id,
        metadata: { hostname },
      });
      return this.shape(created, target);
    });
  }

  async verify(principal: Principal, id: string) {
    this.assertAdmin(principal);
    const target = this.targetHostname();
    const domain = await this.database.run(principal, async (tx) => {
      const rows = await tx.$queryRaw<DomainRow[]>`
        SELECT id, hostname, verification_token, status, tls_status, verified_at,
               last_checked_at, last_error, created_at, updated_at
        FROM custom_domains
        WHERE id = ${id}::uuid
        LIMIT 1
      `;
      const row = rows[0];
      if (!row) throw new NotFoundException('Custom domain not found');
      return row;
    });

    const txtName = '_sessions-verify.' + domain.hostname;
    let cnameOk = false;
    let txtOk = false;
    const errors: string[] = [];

    try {
      const cnames = (await resolveCname(domain.hostname)).map((value) =>
        value.toLowerCase().replace(/\.$/, ''),
      );
      cnameOk = cnames.includes(target);
      if (!cnameOk) errors.push('CNAME does not point to ' + target);
    } catch {
      errors.push('CNAME record could not be resolved');
    }

    try {
      const records = await resolveTxt(txtName);
      txtOk = records.map((parts) => parts.join('')).includes(domain.verification_token);
      if (!txtOk) errors.push('TXT verification token does not match');
    } catch {
      errors.push('TXT verification record could not be resolved');
    }

    return this.database.run(principal, async (tx) => {
      const verified = cnameOk && txtOk;
      const rows = await tx.$queryRaw<DomainRow[]>`
        UPDATE custom_domains
        SET status = ${verified ? 'VERIFIED' : 'PENDING'},
            tls_status = ${verified ? 'PENDING' : domain.tls_status},
            verified_at = ${verified ? new Date() : domain.verified_at},
            last_checked_at = NOW(),
            last_error = ${verified ? null : errors.join('; ').slice(0, 1000)},
            updated_at = NOW()
        WHERE id = ${id}::uuid
        RETURNING id, hostname, verification_token, status, tls_status, verified_at,
                  last_checked_at, last_error, created_at, updated_at
      `;
      const updated = rows[0];
      if (!updated) throw new NotFoundException('Custom domain not found');
      await this.audit.record(tx, principal, {
        action: verified ? 'custom_domain.verified' : 'custom_domain.verification_failed',
        resourceType: 'custom_domain',
        resourceId: id,
        metadata: { hostname: domain.hostname, cnameOk, txtOk },
      });
      return this.shape(updated, target);
    });
  }

  async remove(principal: Principal, id: string) {
    this.assertAdmin(principal);
    return this.database.run(principal, async (tx) => {
      const rows = await tx.$queryRaw<{ id: string; hostname: string }[]>`
        DELETE FROM custom_domains
        WHERE id = ${id}::uuid
        RETURNING id, hostname
      `;
      const deleted = rows[0];
      if (!deleted) throw new NotFoundException('Custom domain not found');
      await this.audit.record(tx, principal, {
        action: 'custom_domain.deleted',
        resourceType: 'custom_domain',
        resourceId: id,
        metadata: { hostname: deleted.hostname },
      });
      return { id, deleted: true };
    });
  }

  private shape(row: DomainRow, target: string) {
    return {
      id: row.id,
      hostname: row.hostname,
      status: row.status,
      tlsStatus: row.tls_status,
      verifiedAt: row.verified_at,
      lastCheckedAt: row.last_checked_at,
      lastError: row.last_error,
      createdAt: row.created_at,
      dns: {
        cname: { name: row.hostname, value: target },
        txt: { name: '_sessions-verify.' + row.hostname, value: row.verification_token },
      },
    };
  }

  private normalizeHostname(raw: string): string {
    const hostname = raw.trim().toLowerCase().replace(/\.$/, '');
    if (hostname.startsWith('*.') || hostname.includes('://') || hostname.includes('/') || hostname.includes(':')) {
      throw new BadRequestException('Enter a hostname only, without protocol, path, port, or wildcard');
    }
    if (!hostname.includes('.') || hostname.length > 253) {
      throw new BadRequestException('A valid fully qualified hostname is required');
    }
    const labels = hostname.split('.');
    const valid = labels.every((label) =>
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label),
    );
    if (!valid || hostname === 'localhost' || hostname.endsWith('.local')) {
      throw new BadRequestException('A valid public hostname is required');
    }
    return hostname;
  }

  private targetHostname(): string {
    const raw = this.config.get<string>('CUSTOM_DOMAIN_CNAME_TARGET', 'domains.sessions.local');
    return raw.trim().toLowerCase().replace(/\.$/, '');
  }

  private assertAdmin(principal: Principal): void {
    if (!hasAnyRole(principal, ADMIN_ROLES)) {
      throw new ForbiddenException('Owner or admin role is required');
    }
  }
}