import { Prisma } from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  TooManyRequestsException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../infrastructure/redis.service';
import { CreateMarketingLeadDto } from './dto/create-marketing-lead.dto';

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

    const normalized = {
      kind: input.kind,
      name: input.name?.trim() || null,
      email,
      company: input.company?.trim() || null,
      teamSize: input.teamSize?.trim() || null,
      message: input.message?.trim() || null,
      sourcePath: input.sourcePath?.trim() || null,
      consent: input.consent,
      metadata: input.metadata,
    };
    const requestHash = createHash('sha256').update(JSON.stringify(normalized)).digest('hex');

    try {
      const lead = await this.prisma.marketingLead.create({
        data: {
          submissionKey: input.submissionKey,
          requestHash,
          ...normalized,
          metadata: normalized.metadata as Prisma.InputJsonValue,
        },
        select: { id: true, kind: true, createdAt: true },
      });
      return { ...lead, status: 'RECEIVED' as const };
    } catch (error: unknown) {
      if (this.isUniqueConflict(error)) {
        const existing = await this.prisma.marketingLead.findUnique({
          where: { submissionKey: input.submissionKey },
          select: { id: true, kind: true, createdAt: true, requestHash: true },
        });
        if (existing?.requestHash === requestHash) {
          return {
            id: existing.id,
            kind: existing.kind,
            createdAt: existing.createdAt,
            status: 'RECEIVED' as const,
          };
        }
        if (existing) {
          throw new ConflictException('Submission key was already used for a different request');
        }
      }
      throw error;
    }
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
          throw new TooManyRequestsException('Too many requests. Please wait before retrying.');
        }
      }
    } catch (error: unknown) {
      if (error instanceof TooManyRequestsException) throw error;
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
