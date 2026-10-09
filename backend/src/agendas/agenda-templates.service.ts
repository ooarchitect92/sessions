import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type AgendaItemType, type AgendaTemplate } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { HOST_ROLES, hasAnyRole, type Principal } from '../common/auth/principal';
import { EmbedResolverService } from '../content/embed-resolver.service';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { OutboxService } from '../outbox/outbox.service';
import { ApplyAgendaTemplateDto } from './dto/apply-agenda-template.dto';
import { CreateAgendaTemplateFromSessionDto } from './dto/create-agenda-template-from-session.dto';
import { CreateAgendaTemplateDto } from './dto/create-agenda-template.dto';
import { UpdateAgendaTemplateDto } from './dto/update-agenda-template.dto';

type TemplateItem = {
  title: string;
  durationSeconds: number;
  type: AgendaItemType;
  content: Record<string, unknown>;
};

@Injectable()
export class AgendaTemplatesService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly embeds: EmbedResolverService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async list(principal: Principal) {
    return this.database.run(principal, (transaction) =>
      transaction.agendaTemplate.findMany({
        orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
        include: {
          createdBy: {
            select: { id: true, displayName: true },
          },
        },
      }),
    );
  }

  async create(principal: Principal, input: CreateAgendaTemplateDto) {
    this.assertHost(principal);
    const items = this.normalizeItems(input.items);
    this.assertItems(items);

    return this.database.run(principal, async (transaction) => {
      const existing = await transaction.agendaTemplate.findFirst({
        where: { workspaceId: principal.workspaceId, name: input.name.trim() },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException('An agenda template with this name already exists');
      }

      const template = await transaction.agendaTemplate.create({
        data: {
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          createdById: principal.userId,
          name: input.name.trim(),
          description: input.description?.trim() || null,
          items: items as Prisma.InputJsonValue,
        },
      });
      await this.recordCreated(transaction, principal, template, items.length, 'manual');
      return template;
    });
  }

  async createFromSession(
    principal: Principal,
    sessionId: string,
    input: CreateAgendaTemplateFromSessionDto,
  ) {
    this.assertHost(principal);
    return this.database.run(principal, async (transaction) => {
      const session = await transaction.session.findUnique({
        where: { id: sessionId },
        select: {
          id: true,
          agendaItems: {
            orderBy: { position: 'asc' },
            select: {
              title: true,
              durationSeconds: true,
              type: true,
              content: true,
            },
          },
        },
      });
      if (!session) throw new NotFoundException('Session not found');
      if (session.agendaItems.length === 0) {
        throw new BadRequestException('The session does not have an agenda to save');
      }
      const existing = await transaction.agendaTemplate.findFirst({
        where: { workspaceId: principal.workspaceId, name: input.name.trim() },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException('An agenda template with this name already exists');
      }
      const items: TemplateItem[] = session.agendaItems.map((item) => ({
        title: item.title,
        durationSeconds: item.durationSeconds,
        type: item.type,
        content: this.jsonObject(item.content),
      }));
      this.assertItems(items);

      const template = await transaction.agendaTemplate.create({
        data: {
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          createdById: principal.userId,
          name: input.name.trim(),
          description: input.description?.trim() || null,
          items: items as Prisma.InputJsonValue,
        },
      });
      await this.recordCreated(transaction, principal, template, items.length, 'session', sessionId);
      return template;
    });
  }

  async update(principal: Principal, templateId: string, input: UpdateAgendaTemplateDto) {
    this.assertHost(principal);
    return this.database.run(principal, async (transaction) => {
      const current = await transaction.agendaTemplate.findUnique({
        where: { id: templateId },
      });
      if (!current) throw new NotFoundException('Agenda template not found');
      if (current.version !== input.version) {
        throw new ConflictException(`Version conflict. Current version is ${current.version}`);
      }
      if (input.name !== undefined && input.name.trim() !== current.name) {
        const conflict = await transaction.agendaTemplate.findFirst({
          where: {
            workspaceId: principal.workspaceId,
            name: input.name.trim(),
            id: { not: templateId },
          },
          select: { id: true },
        });
        if (conflict) {
          throw new ConflictException('An agenda template with this name already exists');
        }
      }

      const items = input.items ? this.normalizeItems(input.items) : undefined;
      if (items) this.assertItems(items);

      const updated = await transaction.agendaTemplate.update({
        where: { id: templateId },
        data: {
          version: { increment: 1 },
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.description !== undefined
            ? { description: input.description.trim() || null }
            : {}),
          ...(items ? { items: items as Prisma.InputJsonValue } : {}),
        },
      });
      await this.audit.record(transaction, principal, {
        action: 'agenda_template.updated',
        resourceType: 'agenda_template',
        resourceId: templateId,
        metadata: { previousVersion: input.version, version: updated.version },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'agenda_template',
        aggregateId: templateId,
        eventType: 'agenda.template.updated',
        payload: this.toJson(updated),
      });
      return updated;
    });
  }

  async remove(principal: Principal, templateId: string) {
    this.assertHost(principal);
    return this.database.run(principal, async (transaction) => {
      const template = await transaction.agendaTemplate.findUnique({ where: { id: templateId } });
      if (!template) throw new NotFoundException('Agenda template not found');
      await transaction.agendaTemplate.delete({ where: { id: templateId } });
      await this.audit.record(transaction, principal, {
        action: 'agenda_template.deleted',
        resourceType: 'agenda_template',
        resourceId: templateId,
        metadata: { name: template.name },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'agenda_template',
        aggregateId: templateId,
        eventType: 'agenda.template.deleted',
        payload: { id: templateId, name: template.name },
      });
      return { id: templateId, deleted: true as const };
    });
  }

  async apply(
    principal: Principal,
    templateId: string,
    sessionId: string,
    input: ApplyAgendaTemplateDto,
  ) {
    this.assertHost(principal);
    return this.database.run(principal, async (transaction) => {
      const [template, session] = await Promise.all([
        transaction.agendaTemplate.findUnique({ where: { id: templateId } }),
        transaction.session.findUnique({
          where: { id: sessionId },
          select: { id: true, status: true },
        }),
      ]);
      if (!template) throw new NotFoundException('Agenda template not found');
      if (!session) throw new NotFoundException('Session not found');
      if (!['DRAFT', 'SCHEDULED'].includes(session.status)) {
        throw new BadRequestException(`Agenda cannot be edited while session is ${session.status}`);
      }

      const items = this.templateItems(template.items);
      this.assertItems(items);
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${sessionId}, 0))`;

      if (input.mode === 'REPLACE') {
        await transaction.session.update({
          where: { id: sessionId },
          data: { currentAgendaItemId: null, version: { increment: 1 } },
        });
        await transaction.agendaItem.deleteMany({ where: { sessionId } });
      }

      const last = await transaction.agendaItem.findFirst({
        where: { sessionId },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      const startPosition = (last?.position ?? -1) + 1;

      for (const [index, item] of items.entries()) {
        await transaction.agendaItem.create({
          data: {
            organizationId: principal.organizationId,
            workspaceId: principal.workspaceId,
            sessionId,
            position: startPosition + index,
            title: item.title,
            durationSeconds: item.durationSeconds,
            type: item.type,
            content: item.content as Prisma.InputJsonValue,
          },
        });
      }

      const agenda = await transaction.agendaItem.findMany({
        where: { sessionId },
        orderBy: { position: 'asc' },
      });
      await this.audit.record(transaction, principal, {
        action: 'agenda_template.applied',
        resourceType: 'agenda_template',
        resourceId: templateId,
        metadata: { sessionId, mode: input.mode, itemCount: items.length },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'session',
        aggregateId: sessionId,
        eventType: 'agenda.template.applied',
        payload: { sessionId, templateId, mode: input.mode, itemCount: items.length },
      });
      return agenda;
    });
  }

  private async recordCreated(
    transaction: Prisma.TransactionClient,
    principal: Principal,
    template: AgendaTemplate,
    itemCount: number,
    source: 'manual' | 'session',
    sessionId?: string,
  ) {
    await this.audit.record(transaction, principal, {
      action: 'agenda_template.created',
      resourceType: 'agenda_template',
      resourceId: template.id,
      metadata: { name: template.name, itemCount, source, sessionId: sessionId ?? null },
    });
    await this.outbox.enqueue(transaction, principal, {
      aggregateType: 'agenda_template',
      aggregateId: template.id,
      eventType: 'agenda.template.created',
      payload: this.toJson(template),
    });
  }

  private normalizeItems(items: Array<{
    title: string;
    durationSeconds: number;
    type: AgendaItemType;
    content: Record<string, unknown>;
  }>): TemplateItem[] {
    return items.map((item) => ({
      title: item.title.trim(),
      durationSeconds: item.durationSeconds,
      type: item.type,
      content: item.content ?? {},
    }));
  }

  private templateItems(value: Prisma.JsonValue): TemplateItem[] {
    if (!Array.isArray(value)) throw new BadRequestException('Agenda template items are invalid');
    return value.map((item) => {
      if (!item || Array.isArray(item) || typeof item !== 'object') {
        throw new BadRequestException('Agenda template items are invalid');
      }
      const record = item as Record<string, unknown>;
      if (
        typeof record.title !== 'string' ||
        typeof record.durationSeconds !== 'number' ||
        typeof record.type !== 'string'
      ) {
        throw new BadRequestException('Agenda template items are invalid');
      }
      return {
        title: record.title,
        durationSeconds: record.durationSeconds,
        type: record.type as AgendaItemType,
        content: this.jsonObject(record.content as Prisma.JsonValue),
      };
    });
  }

  private assertItems(items: TemplateItem[]) {
    if (items.length < 1 || items.length > 30) {
      throw new BadRequestException('Agenda templates must contain between 1 and 30 items');
    }
    for (const item of items) {
      if (!item.title || item.title.length > 160) {
        throw new BadRequestException('Agenda template item titles must be 1 to 160 characters');
      }
      if (!Number.isInteger(item.durationSeconds) || item.durationSeconds < 0 || item.durationSeconds > 86400) {
        throw new BadRequestException('Agenda template item duration is invalid');
      }
      if (!['TEXT','PRESENTATION','WEBSITE','VIDEO','POLL','WHITEBOARD','BREAKOUT','QA','SCREEN_SHARE'].includes(item.type)) {
        throw new BadRequestException('Agenda template item type is invalid');
      }
      if (['WEBSITE', 'VIDEO', 'PRESENTATION'].includes(item.type)) {
        const url = item.content.url;
        if (url !== undefined) {
          if (typeof url !== 'string' || !url.trim()) {
            throw new BadRequestException('Agenda content URL must be a non-empty HTTPS URL');
          }
          this.embeds.resolve(url);
        }
      }
    }
  }

  private assertHost(principal: Principal) {
    if (!hasAnyRole(principal, HOST_ROLES)) {
      throw new ForbiddenException('A host role is required');
    }
  }

  private jsonObject(value: Prisma.JsonValue | undefined): Record<string, unknown> {
    if (!value || Array.isArray(value) || typeof value !== 'object') return {};
    return value as Record<string, unknown>;
  }

  private toJson(value: unknown): Prisma.JsonObject {
    return JSON.parse(JSON.stringify(value)) as Prisma.JsonObject;
  }
}
