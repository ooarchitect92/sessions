import { Prisma } from '@prisma/client';
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateMarketingLeadDto } from './dto/create-marketing-lead.dto';

@Injectable()
export class MarketingService {
  constructor(private readonly prisma: PrismaService) {}

  async createLead(input: CreateMarketingLeadDto) {
    if (input.website?.trim()) {
      throw new BadRequestException('The request could not be accepted');
    }
    if (!input.consent) {
      throw new BadRequestException('Consent is required to submit this request');
    }
    if (input.kind !== 'NEWSLETTER' && !input.name?.trim()) {
      throw new BadRequestException('Name is required for this request');
    }

    const lead = await this.prisma.marketingLead.create({
      data: {
        kind: input.kind,
        name: input.name?.trim() || null,
        email: input.email.trim().toLowerCase(),
        company: input.company?.trim() || null,
        teamSize: input.teamSize?.trim() || null,
        message: input.message?.trim() || null,
        sourcePath: input.sourcePath?.trim() || null,
        consent: input.consent,
        metadata: input.metadata as Prisma.InputJsonValue,
      },
      select: { id: true, kind: true, createdAt: true },
    });

    return { ...lead, status: 'RECEIVED' as const };
  }
}
