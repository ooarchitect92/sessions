import { Prisma } from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../infrastructure/redis.service';
import { CreateMarketingLeadDto } from './dto/create-marketing-lead.dto';

const APPROVED_METADATA_KEYS = [
  'actionId',
  'intent',
  'utmSource',
  'utmMedium',
  'utmCampaign',
  'utmContent',
  'utmTerm',
] as const;

@Injectable()
export class MarketingService {
  private readonly logger = new Logger(MarketingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  async createLead(input: CreateMarketingLeadDto, clientIp?: string) {
    if (input.website?.trim()) {
      throw new BadRequestException('The request could not be accepted');
    }
    if (!input.consent) {
      throw new BadRequestException('Consent is required to submit this request');
    }
    if (input.kind !== 'NEWSLETTER' && !input.name?.trim()) {
      throw new BadRequestException('Name is required for this request');
    }

    const email = input.email.trim().toLowerCase();
    await this.enforceRateLimit(email, clientIp);

    const metadata = this.sanitizeMetadata(input.metadata);
    const consent = this.consentContract(input.kind);
    const normalized = {
      kind: input.kind,
      name: input.name?.trim() || null,
      email,
      company: input.company?.trim() || null,
      teamSize: input.teamSize?.trim() || null,
      message: input.message?.trim() || null,
      sourcePath: input.sourcePath?.trim() || null,
      consent: input.consent,
      metadata,
    };
    const requestHash = createHash('sha256').update(JSON.stringify(normalized)).digest('hex');

    try {
      const result = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.marketingLead.create({
          data: {
            submissionKey: input.submissionKey,
            requestHash,
            ...normalized,
            metadata: metadata as Prisma.InputJsonValue,
          },
          select: { id: true, kind: true, createdAt: true },
        });

        const evidence = await transaction.marketingConsentEvidence.create({
          data: {
            leadId: created.id,
            purpose: consent.purpose,
            version: consent.version,
            statementHash: consent.statementHash,
          },
          select: { id: true },
        });

        await transaction.marketingLeadAuditEvent.create({
          data: {
            leadId: created.id,
            action: 'marketing.lead.accepted',
            metadata: {
              kind: normalized.kind,
              sourcePath: normalized.sourcePath,
              consentEvidenceId: evidence.id,
              attribution: metadata,
            } as Prisma.InputJsonValue,
          },
        });

        const outbox = await transaction.marketingLeadOutboxEvent.create({
          data: {
            leadId: created.id,
            eventType: 'marketing.lead.received',
            payload: {
              leadId: created.id,
              kind: normalized.kind,
              email: normalized.email,
              name: normalized.name,
              company: normalized.company,
              teamSize: normalized.teamSize,
              sourcePath: normalized.sourcePath,
              attribution: metadata,
              consentEvidenceId: evidence.id,
              createdAt: created.createdAt.toISOString(),
            } as Prisma.InputJsonValue,
          },
          select: { id: true },
        });

        return { created, outbox };
      });

      return {
        ...result.created,
        status: 'RECEIVED' as const,
        receiptReference: result.created.id,
        conversionEventId: result.outbox.id,
      };
    } catch (error: unknown) {
      if (this.isUniqueConflict(error)) {
        const existing = await this.prisma.marketingLead.findUnique({
          where: { submissionKey: input.submissionKey },
          select: { id: true, kind: true, createdAt: true, requestHash: true },
        });
        if (existing?.requestHash === requestHash) {
          const outbox = await this.prisma.marketingLeadOutboxEvent.findFirst({
            where: { leadId: existing.id, eventType: 'marketing.lead.received' },
            select: { id: true },
          });
          return {
            id: existing.id,
            kind: existing.kind,
            createdAt: existing.createdAt,
            status: 'RECEIVED' as const,
            receiptReference: existing.id,
            conversionEventId: outbox?.id ?? null,
          };
        }
        if (existing) {
          throw new ConflictException('Submission key was already used for a different request');
        }
      }
      throw error;
    }
  }

  private sanitizeMetadata(input: Record<string, unknown>): Record<string, string> {
    const clean: Record<string, string> = {};
    for (const key of APPROVED_METADATA_KEYS) {
      const value = input[key];
      if (typeof value === 'string') {
        const normalized = value.trim();
        if (normalized) clean[key] = normalized.slice(0, 160);
      }
    }
    return clean;
  }

  private consentContract(kind: CreateMarketingLeadDto['kind']) {
    const purpose =
      kind === 'NEWSLETTER' ? 'product_updates' : 'respond_to_request';
    const version = kind === 'NEWSLETTER' ? 'newsletter-consent-v1' : 'enquiry-consent-v1';
    const statement =
      kind === 'NEWSLETTER'
        ? 'I agree that Sessions can use this email to send product updates.'
        : 'I agree that Sessions can use these details to respond to this request.';
    const statementHash = createHash('sha256').update(statement).digest('hex');
    return { purpose, version, statementHash };
  }

  private async enforceRateLimit(email: string, clientIp?: string): Promise<void> {
    try {
      const pepper = this.config.getOrThrow<string>('AUTH_IP_HASH_PEPPER');
      const identities = [`email:${email}`, ...(clientIp ? [`ip:${clientIp}`] : [])];
      for (const identity of identities) {
        const digest = createHash('sha256')
          .update(`${pepper}:marketing:${identity}`)
          .digest('hex');
        const key = `marketing:lead-rate:${digest}`;
        const count = await this.redis.incr(key);
        if (count === 1) await this.redis.expire(key, 600);
        if (count > 8) {
          throw new HttpException(
            'Too many requests. Please wait before retrying.',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      }
    } catch (error: unknown) {
      if (error instanceof HttpException && error.getStatus() === HttpStatus.TOO_MANY_REQUESTS) {
        throw error;
      }
      this.logger.warn(
        `Marketing lead rate-limit check degraded: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  private isUniqueConflict(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2002'
    );
  }
}
