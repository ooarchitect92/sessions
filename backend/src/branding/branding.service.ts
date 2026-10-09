import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CustomDomainStatus,
  CustomDomainTlsStatus,
  Prisma,
} from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import { AuditService } from '../audit/audit.service';
import {
  ADMIN_ROLES,
  hasAnyRole,
  type Principal,
} from '../common/auth/principal';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { WorkerPrismaService } from '../database/worker-prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import type { CreateCustomDomainDto } from './dto/create-custom-domain.dto';
import type { UpdateBrandingDto } from './dto/update-branding.dto';
import { normalizeCustomDomainHostname } from './custom-domain-policy';

@Injectable()
export class BrandingService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly worker: WorkerPrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly config: ConfigService,
  ) {}

  async getBranding(principal: Principal) {
    return this.database.run(principal, async (transaction) => {
      const branding = await transaction.workspaceBranding.findUnique({
        where: { workspaceId: principal.workspaceId },
      });
      return this.brandingProjection(branding);
    });
  }

  async updateBranding(principal: Principal, input: UpdateBrandingDto) {
    this.assertAdmin(principal);
    const data = this.brandingData(input);

    return this.database.run(principal, async (transaction) => {
      const branding = await transaction.workspaceBranding.upsert({
        where: { workspaceId: principal.workspaceId },
        update: data,
        create: {
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          ...data,
        },
      });
      await this.audit.record(transaction, principal, {
        action: 'branding.updated',
        resourceType: 'workspace_branding',
        resourceId: branding.id,
        metadata: {
          displayName: branding.displayName,
          primaryColor: branding.primaryColor,
          accentColor: branding.accentColor,
          hideSessionsBranding: branding.hideSessionsBranding,
        },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'workspace_branding',
        aggregateId: branding.id,
        eventType: 'branding.updated',
        payload: {
          brandingId: branding.id,
          workspaceId: principal.workspaceId,
        },
      });
      return this.brandingProjection(branding);
    });
  }

  async listDomains(principal: Principal) {
    this.assertAdmin(principal);
    return this.database.run(principal, async (transaction) => {
      const domains = await transaction.customDomain.findMany({
        orderBy: { createdAt: 'desc' },
      });
      return domains.map((domain) => this.domainProjection(domain));
    });
  }

  async createDomain(principal: Principal, input: CreateCustomDomainDto) {
    this.assertAdmin(principal);
    const hostname = normalizeCustomDomainHostname(input.hostname);
    const verificationName = `_sessions-verification.${hostname}`;
    const verificationValue =
      'sessions-domain-verification=' +
      randomBytes(24).toString('base64url');

    try {
      return await this.database.run(principal, async (transaction) => {
        const domain = await transaction.customDomain.create({
          data: {
            organizationId: principal.organizationId,
            workspaceId: principal.workspaceId,
            hostname,
            verificationName,
            verificationValue,
          },
        });
        await this.audit.record(transaction, principal, {
          action: 'branding.domain.created',
          resourceType: 'custom_domain',
          resourceId: domain.id,
          metadata: { hostname },
        });
        await this.outbox.enqueue(transaction, principal, {
          aggregateType: 'custom_domain',
          aggregateId: domain.id,
          eventType: 'branding.domain.created',
          payload: {
            customDomainId: domain.id,
            hostname,
          },
        });
        return this.domainProjection(domain);
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('This hostname is already registered');
      }
      throw error;
    }
  }

  async verifyDomain(principal: Principal, domainId: string) {
    this.assertAdmin(principal);
    const domain = await this.database.run(principal, (transaction) =>
      transaction.customDomain.findUnique({ where: { id: domainId } }),
    );
    if (!domain) throw new NotFoundException('Custom domain not found');
    if (domain.status === CustomDomainStatus.DISABLED) {
      throw new BadRequestException('Enable a new domain record before verification');
    }

    const checkedAt = new Date();
    let verified = false;
    let lookupError: string | null = null;
    try {
      const records = await resolveTxt(domain.verificationName);
      verified = records
        .map((parts) => parts.join(''))
        .some((value) => value === domain.verificationValue);
      if (!verified) lookupError = 'verification_txt_record_not_found';
    } catch (error: unknown) {
      lookupError =
        error instanceof Error
          ? `dns_lookup_failed:${error.message}`.slice(0, 1000)
          : 'dns_lookup_failed';
    }

    return this.database.run(principal, async (transaction) => {
      if (!verified) {
        const updated = await transaction.customDomain.update({
          where: { id: domain.id },
          data: {
            lastCheckedAt: checkedAt,
            lastError: lookupError,
          },
        });
        return this.domainProjection(updated);
      }

      const firstVerification =
        domain.status !== CustomDomainStatus.VERIFIED;
      const updated = await transaction.customDomain.update({
        where: { id: domain.id },
        data: {
          status: CustomDomainStatus.VERIFIED,
          tlsStatus:
            domain.tlsStatus === CustomDomainTlsStatus.ACTIVE
              ? CustomDomainTlsStatus.ACTIVE
              : CustomDomainTlsStatus.PENDING,
          verifiedAt: domain.verifiedAt ?? checkedAt,
          lastCheckedAt: checkedAt,
          lastError: null,
        },
      });

      if (firstVerification) {
        await this.audit.record(transaction, principal, {
          action: 'branding.domain.verified',
          resourceType: 'custom_domain',
          resourceId: updated.id,
          metadata: { hostname: updated.hostname },
        });
        await this.outbox.enqueue(transaction, principal, {
          aggregateType: 'custom_domain',
          aggregateId: updated.id,
          eventType: 'branding.domain.verified',
          payload: {
            customDomainId: updated.id,
            hostname: updated.hostname,
          },
        });
        await this.outbox.enqueue(transaction, principal, {
          aggregateType: 'custom_domain',
          aggregateId: updated.id,
          eventType: 'branding.domain.tls.requested',
          payload: {
            customDomainId: updated.id,
            hostname: updated.hostname,
          },
        });
      }

      return this.domainProjection(updated);
    });
  }

  async disableDomain(principal: Principal, domainId: string) {
    this.assertAdmin(principal);
    return this.database.run(principal, async (transaction) => {
      const domain = await transaction.customDomain.findUnique({
        where: { id: domainId },
      });
      if (!domain) throw new NotFoundException('Custom domain not found');

      const updated = await transaction.customDomain.update({
        where: { id: domain.id },
        data: {
          status: CustomDomainStatus.DISABLED,
          lastError: null,
        },
      });
      await this.audit.record(transaction, principal, {
        action: 'branding.domain.disabled',
        resourceType: 'custom_domain',
        resourceId: updated.id,
        metadata: { hostname: updated.hostname },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'custom_domain',
        aggregateId: updated.id,
        eventType: 'branding.domain.disabled',
        payload: {
          customDomainId: updated.id,
          hostname: updated.hostname,
        },
      });
      return this.domainProjection(updated);
    });
  }

  async resolvePublicBranding(hostnameInput: string) {
    const hostname = normalizeCustomDomainHostname(hostnameInput);
    const domain = await this.worker.customDomain.findUnique({
      where: { hostname },
      include: {
        workspace: true,
      },
    });
    if (
      !domain ||
      domain.status !== CustomDomainStatus.VERIFIED ||
      domain.tlsStatus !== CustomDomainTlsStatus.ACTIVE
    ) {
      throw new NotFoundException('Custom domain is not active');
    }
    const branding = await this.worker.workspaceBranding.findUnique({
      where: { workspaceId: domain.workspaceId },
    });
    return {
      hostname: domain.hostname,
      workspace: {
        id: domain.workspace.id,
        name: domain.workspace.name,
        slug: domain.workspace.slug,
      },
      branding: this.brandingProjection(branding),
    };
  }

  async completeTlsProvisioning(
    domainId: string,
    success: boolean,
    error?: string,
  ): Promise<void> {
    const domain = await this.worker.customDomain.findUnique({
      where: { id: domainId },
    });
    if (!domain) return;
    await this.worker.customDomain.update({
      where: { id: domain.id },
      data: success
        ? {
            tlsStatus: CustomDomainTlsStatus.ACTIVE,
            tlsProvisionedAt: new Date(),
            lastError: null,
          }
        : {
            tlsStatus: CustomDomainTlsStatus.ERROR,
            lastError: (error ?? 'tls_provisioning_failed').slice(0, 1000),
          },
    });
  }

  private brandingData(input: UpdateBrandingDto) {
    return {
      ...(input.displayName !== undefined
        ? { displayName: this.nullable(input.displayName) }
        : {}),
      ...(input.logoUrl !== undefined
        ? { logoUrl: this.nullable(input.logoUrl) }
        : {}),
      ...(input.faviconUrl !== undefined
        ? { faviconUrl: this.nullable(input.faviconUrl) }
        : {}),
      ...(input.primaryColor !== undefined
        ? { primaryColor: this.nullable(input.primaryColor)?.toUpperCase() ?? null }
        : {}),
      ...(input.accentColor !== undefined
        ? { accentColor: this.nullable(input.accentColor)?.toUpperCase() ?? null }
        : {}),
      ...(input.emailFromName !== undefined
        ? { emailFromName: this.nullable(input.emailFromName) }
        : {}),
      ...(input.supportUrl !== undefined
        ? { supportUrl: this.nullable(input.supportUrl) }
        : {}),
      ...(input.hideSessionsBranding !== undefined
        ? { hideSessionsBranding: input.hideSessionsBranding }
        : {}),
    };
  }

  private brandingProjection(
    branding:
      | {
          id: string;
          displayName: string | null;
          logoUrl: string | null;
          faviconUrl: string | null;
          primaryColor: string | null;
          accentColor: string | null;
          emailFromName: string | null;
          supportUrl: string | null;
          hideSessionsBranding: boolean;
          createdAt: Date;
          updatedAt: Date;
        }
      | null,
  ) {
    return {
      id: branding?.id ?? null,
      displayName: branding?.displayName ?? null,
      logoUrl: branding?.logoUrl ?? null,
      faviconUrl: branding?.faviconUrl ?? null,
      primaryColor: branding?.primaryColor ?? null,
      accentColor: branding?.accentColor ?? null,
      emailFromName: branding?.emailFromName ?? null,
      supportUrl: branding?.supportUrl ?? null,
      hideSessionsBranding: branding?.hideSessionsBranding ?? false,
      createdAt: branding?.createdAt ?? null,
      updatedAt: branding?.updatedAt ?? null,
    };
  }

  private domainProjection(domain: {
    id: string;
    hostname: string;
    verificationName: string;
    verificationValue: string;
    status: CustomDomainStatus;
    tlsStatus: CustomDomainTlsStatus;
    verifiedAt: Date | null;
    lastCheckedAt: Date | null;
    tlsProvisionedAt: Date | null;
    lastError: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: domain.id,
      hostname: domain.hostname,
      verification: {
        type: 'TXT',
        name: domain.verificationName,
        value: domain.verificationValue,
      },
      routing: {
        type: 'CNAME',
        name: domain.hostname,
        value: this.config.get<string>(
          'CUSTOM_DOMAIN_CNAME_TARGET',
          'domains.sessions.local',
        ),
      },
      status: domain.status,
      tlsStatus: domain.tlsStatus,
      verifiedAt: domain.verifiedAt,
      lastCheckedAt: domain.lastCheckedAt,
      tlsProvisionedAt: domain.tlsProvisionedAt,
      lastError: domain.lastError,
      createdAt: domain.createdAt,
      updatedAt: domain.updatedAt,
    };
  }

  private nullable(value: string | null): string | null {
    if (value === null) return null;
    const normalized = value.trim();
    return normalized ? normalized : null;
  }

  private assertAdmin(principal: Principal): void {
    if (!hasAnyRole(principal, ADMIN_ROLES)) {
      throw new ForbiddenException('An owner or admin role is required');
    }
  }
}
