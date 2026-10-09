import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SessionStatus, type AgendaItem } from '@prisma/client';
import { AiProviderService } from '../ai/ai-provider.service';
import { AuditService } from '../audit/audit.service';
import {
  HOST_ROLES,
  hasAnyRole,
  type Principal,
} from '../common/auth/principal';
import { EmbedResolverService } from '../content/embed-resolver.service';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { RealtimeEventsService } from '../infrastructure/realtime-events.service';
import { OutboxService } from '../outbox/outbox.service';
import { ApplyAgendaDraftDto } from './dto/apply-agenda-draft.dto';
import { CreateAgendaItemDto } from './dto/create-agenda-item.dto';
import { GenerateAgendaDraftDto } from './dto/generate-agenda-draft.dto';
import { ReorderAgendaDto } from './dto/reorder-agenda.dto';

const EDITABLE_SESSION_STATUSES = new Set<SessionStatus>([
  SessionStatus.DRAFT,
  SessionStatus.SCHEDULED,
]);
const ACTIVATABLE_SESSION_STATUSES = new Set<SessionStatus>([
  SessionStatus.DRAFT,
  SessionStatus.SCHEDULED,
  SessionStatus.LIVE,
]);

@Injectable()
export class AgendasService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly ai: AiProviderService,
    private readonly embeds: EmbedResolverService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  async list(principal: Principal, sessionId: string): Promise<AgendaItem[]> {
    return this.database.run(principal, async (transaction) => {
      await this.assertSessionExists(transaction, sessionId);
      return transaction.agendaItem.findMany({
        where: { sessionId },
        orderBy: { position: 'asc' },
      });
    });
  }

  async create(
    principal: Principal,
    sessionId: string,
    input: CreateAgendaItemDto,
  ): Promise<AgendaItem> {
    this.assertHost(principal);
    this.assertEmbeddableContent(input);
    return this.database.run(principal, async (transaction) => {
      await this.assertSessionEditable(transaction, sessionId);
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${sessionId}, 0))`;
      const last = await transaction.agendaItem.findFirst({
        where: { sessionId },
        orderBy: { position: 'desc' },
        select: { position: true },
      });

      const item = await transaction.agendaItem.create({
        data: {
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          sessionId,
          position: (last?.position ?? -1) + 1,
          title: input.title.trim(),
          durationSeconds: input.durationSeconds,
          type: input.type,
          content: input.content as Prisma.InputJsonValue,
        },
      });

      await this.audit.record(transaction, principal, {
        action: 'agenda_item.created',
        resourceType: 'agenda_item',
        resourceId: item.id,
        metadata: { sessionId, position: item.position, type: item.type },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'session',
        aggregateId: sessionId,
        eventType: 'agenda.item.created',
        payload: this.toJson(item),
      });
      return item;
    });
  }


  async generateDraft(
    principal: Principal,
    sessionId: string,
    input: GenerateAgendaDraftDto,
  ) {
    this.assertHost(principal);
    if (!this.ai.isEnabled()) {
      throw new BadRequestException('AI agenda generation is not configured');
    }

    const session = await this.database.run(principal, async (transaction) => {
      await this.assertSessionEditable(transaction, sessionId);
      const value = await transaction.session.findUnique({
        where: { id: sessionId },
        select: {
          id: true,
          title: true,
          description: true,
          durationMinutes: true,
        },
      });
      if (!value) throw new NotFoundException('Session not found');
      return value;
    });

    const draft = await this.ai.generateAgendaDraft({
      title: session.title,
      description: session.description,
      durationMinutes: session.durationMinutes,
      ...(input.prompt !== undefined ? { prompt: input.prompt } : {}),
    });

    await this.database.run(principal, async (transaction) => {
      await this.audit.record(transaction, principal, {
        action: 'agenda.ai_draft.generated',
        resourceType: 'session',
        resourceId: sessionId,
        metadata: {
          provider: draft.provider,
          model: draft.model ?? null,
          itemCount: draft.items.length,
        },
      });
    });

    return {
      sessionId,
      provider: draft.provider,
      model: draft.model ?? null,
      items: draft.items,
    };
  }

  async applyDraft(
    principal: Principal,
    sessionId: string,
    input: ApplyAgendaDraftDto,
  ): Promise<AgendaItem[]> {
    this.assertHost(principal);
    for (const item of input.items) this.assertEmbeddableContent(item);

    return this.database.run(principal, async (transaction) => {
      await this.assertSessionEditable(transaction, sessionId);
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${sessionId}, 0))`;

      if (input.mode === 'REPLACE') {
        await transaction.session.update({
          where: { id: sessionId },
          data: {
            currentAgendaItemId: null,
            currentAgendaActivatedAt: null,
            version: { increment: 1 },
          },
        });
        await transaction.agendaItem.deleteMany({ where: { sessionId } });
      }

      const last = await transaction.agendaItem.findFirst({
        where: { sessionId },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      const startPosition = (last?.position ?? -1) + 1;

      const created: AgendaItem[] = [];
      for (const [index, draft] of input.items.entries()) {
        const item = await transaction.agendaItem.create({
          data: {
            organizationId: principal.organizationId,
            workspaceId: principal.workspaceId,
            sessionId,
            position: startPosition + index,
            title: draft.title.trim(),
            durationSeconds: draft.durationSeconds,
            type: draft.type,
            content: draft.content as Prisma.InputJsonValue,
          },
        });
        created.push(item);
      }

      await this.audit.record(transaction, principal, {
        action: 'agenda.ai_draft.applied',
        resourceType: 'session',
        resourceId: sessionId,
        metadata: {
          mode: input.mode,
          itemCount: created.length,
          agendaItemIds: created.map((item) => item.id),
        },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'session',
        aggregateId: sessionId,
        eventType: 'agenda.draft.applied',
        payload: {
          sessionId,
          mode: input.mode,
          agendaItemIds: created.map((item) => item.id),
        },
      });

      return created;
    });
  }

  async reorder(
    principal: Principal,
    sessionId: string,
    input: ReorderAgendaDto,
  ): Promise<AgendaItem[]> {
    this.assertHost(principal);
    if (new Set(input.itemIds).size !== input.itemIds.length) {
      throw new BadRequestException('Agenda item IDs must be unique');
    }

    return this.database.run(principal, async (transaction) => {
      await this.assertSessionEditable(transaction, sessionId);
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${sessionId}, 0))`;
      const items = await transaction.agendaItem.findMany({ where: { sessionId } });
      const existingIds = new Set(items.map((item) => item.id));
      if (
        items.length !== input.itemIds.length ||
        input.itemIds.some((id) => !existingIds.has(id))
      ) {
        throw new BadRequestException(
          'The reorder request must contain every agenda item exactly once',
        );
      }

      await transaction.agendaItem.updateMany({
        where: { sessionId },
        data: { position: { increment: 10_000 } },
      });
      for (const [position, id] of input.itemIds.entries()) {
        await transaction.agendaItem.update({ where: { id }, data: { position } });
      }

      const reordered = await transaction.agendaItem.findMany({
        where: { sessionId },
        orderBy: { position: 'asc' },
      });
      await this.audit.record(transaction, principal, {
        action: 'agenda.reordered',
        resourceType: 'session',
        resourceId: sessionId,
        metadata: { itemIds: input.itemIds },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'session',
        aggregateId: sessionId,
        eventType: 'agenda.reordered',
        payload: { sessionId, itemIds: input.itemIds },
      });
      return reordered;
    });
  }

  async activate(
    principal: Principal,
    sessionId: string,
    agendaItemId: string,
  ): Promise<{ sessionId: string; agendaItem: AgendaItem; activatedAt: string }> {
    this.assertHost(principal);
    const result = await this.database.run(principal, async (transaction) => {
      await this.assertSessionActivatable(transaction, sessionId);
      const item = await transaction.agendaItem.findFirst({
        where: { id: agendaItemId, sessionId },
      });
      if (!item) throw new NotFoundException('Agenda item not found');

      const activatedAt = new Date();
      await transaction.session.update({
        where: { id: sessionId },
        data: {
          currentAgendaItemId: agendaItemId,
          currentAgendaActivatedAt: activatedAt,
          version: { increment: 1 },
        },
      });
      const activatedAtIso = activatedAt.toISOString();
      await this.audit.record(transaction, principal, {
        action: 'agenda_item.activated',
        resourceType: 'agenda_item',
        resourceId: agendaItemId,
        metadata: { sessionId, activatedAt: activatedAtIso },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'session',
        aggregateId: sessionId,
        eventType: 'agenda.item.activated',
        payload: { sessionId, agendaItemId, activatedAt: activatedAtIso },
      });
      return { sessionId, agendaItem: item, activatedAt: activatedAtIso };
    });
    this.realtimeEvents.publishAgendaActivated(result);
    return result;
  }

  private assertEmbeddableContent(input: {
    type: string;
    content: Record<string, unknown>;
  }): void {
    if (!['WEBSITE', 'VIDEO', 'PRESENTATION', 'COBROWSE'].includes(input.type)) return;
    const url = input.content.url;
    if (url === undefined) return;
    if (typeof url !== 'string' || !url.trim()) {
      throw new BadRequestException('Agenda content URL must be a non-empty HTTPS URL');
    }
    this.embeds.resolve(url);
  }

  private async assertSessionEditable(
    transaction: Prisma.TransactionClient,
    sessionId: string,
  ): Promise<void> {
    const session = await transaction.session.findUnique({
      where: { id: sessionId },
      select: { status: true },
    });
    if (!session) throw new NotFoundException('Session not found');
    if (!EDITABLE_SESSION_STATUSES.has(session.status)) {
      throw new BadRequestException(
        `Agenda cannot be edited while session is ${session.status}`,
      );
    }
  }

  private async assertSessionActivatable(
    transaction: Prisma.TransactionClient,
    sessionId: string,
  ): Promise<void> {
    const session = await transaction.session.findUnique({
      where: { id: sessionId },
      select: { status: true },
    });
    if (!session) throw new NotFoundException('Session not found');
    if (!ACTIVATABLE_SESSION_STATUSES.has(session.status)) {
      throw new BadRequestException(
        `Agenda cannot be activated while session is ${session.status}`,
      );
    }
  }

  private async assertSessionExists(
    transaction: Prisma.TransactionClient,
    sessionId: string,
  ): Promise<void> {
    const session = await transaction.session.findUnique({
      where: { id: sessionId },
      select: { id: true },
    });
    if (!session) throw new NotFoundException('Session not found');
  }

  private assertHost(principal: Principal): void {
    if (!hasAnyRole(principal, HOST_ROLES)) {
      throw new ForbiddenException('A host role is required');
    }
  }

  private toJson(value: unknown): Prisma.JsonObject {
    return JSON.parse(JSON.stringify(value)) as Prisma.JsonObject;
  }
}
