import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SessionStatus, type AgendaItem } from '@prisma/client';
import { HttpAiProvider } from '../ai/http-ai.provider';
import { AuditService } from '../audit/audit.service';
import {
  HOST_ROLES,
  hasAnyRole,
  type Principal,
} from '../common/auth/principal';
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
    private readonly ai: HttpAiProvider,
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

  async generateDraft(
    principal: Principal,
    sessionId: string,
    input: GenerateAgendaDraftDto,
  ) {
    this.assertHost(principal);
    const session = await this.database.run(principal, async (transaction) => {
      await this.assertSessionEditable(transaction, sessionId);
      const found = await transaction.session.findUnique({
        where: { id: sessionId },
        select: {
          id: true,
          title: true,
          description: true,
          durationMinutes: true,
        },
      });
      if (!found) throw new NotFoundException('Session not found');
      return found;
    });

    const draft = await this.ai.generateAgenda({
      title: session.title,
      ...(session.description ? { description: session.description } : {}),
      ...(input.objective ? { objective: input.objective.trim() } : {}),
      ...(input.audience ? { audience: input.audience.trim() } : {}),
      durationMinutes: input.durationMinutes ?? session.durationMinutes,
    });

    return {
      sessionId,
      provider: draft.provider,
      model: draft.model,
      items: draft.items,
      totalDurationSeconds: draft.items.reduce(
        (total, item) => total + item.durationSeconds,
        0,
      ),
      generatedAt: new Date().toISOString(),
      persisted: false,
    };
  }

  async applyDraft(
    principal: Principal,
    sessionId: string,
    input: ApplyAgendaDraftDto,
  ): Promise<AgendaItem[]> {
    this.assertHost(principal);
    const result = await this.database.run(principal, async (transaction) => {
      await this.assertSessionEditable(transaction, sessionId);
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${sessionId}, 0))`;
      const last = await transaction.agendaItem.findFirst({
        where: { sessionId },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      const startPosition = (last?.position ?? -1) + 1;

      const created: AgendaItem[] = [];
      for (const [offset, item] of input.items.entries()) {
        created.push(
          await transaction.agendaItem.create({
            data: {
              organizationId: principal.organizationId,
              workspaceId: principal.workspaceId,
              sessionId,
              position: startPosition + offset,
              title: item.title.trim(),
              durationSeconds: item.durationSeconds,
              type: item.type,
              content: item.content as Prisma.InputJsonValue,
            },
          }),
        );
      }

      await this.audit.record(transaction, principal, {
        action: 'agenda.ai_draft_applied',
        resourceType: 'session',
        resourceId: sessionId,
        metadata: {
          itemIds: created.map((item) => item.id),
          itemCount: created.length,
        },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'session',
        aggregateId: sessionId,
        eventType: 'agenda.ai_draft.applied',
        payload: {
          sessionId,
          itemIds: created.map((item) => item.id),
          itemCount: created.length,
        },
      });
      return transaction.agendaItem.findMany({
        where: { sessionId },
        orderBy: { position: 'asc' },
      });
    });

    this.realtimeEvents.publishSessionEvent({
      sessionId,
      eventName: 'agenda.updated',
      payload: { sessionId, reason: 'ai_draft_applied' },
    });
    return result;
  }

  async create(
    principal: Principal,
    sessionId: string,
    input: CreateAgendaItemDto,
  ): Promise<AgendaItem> {
    this.assertHost(principal);
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

      await transaction.session.update({
        where: { id: sessionId },
        data: { currentAgendaItemId: agendaItemId, version: { increment: 1 } },
      });
      const activatedAt = new Date().toISOString();
      await this.audit.record(transaction, principal, {
        action: 'agenda_item.activated',
        resourceType: 'agenda_item',
        resourceId: agendaItemId,
        metadata: { sessionId, activatedAt },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'session',
        aggregateId: sessionId,
        eventType: 'agenda.item.activated',
        payload: { sessionId, agendaItemId, activatedAt },
      });
      return { sessionId, agendaItem: item, activatedAt };
    });
    this.realtimeEvents.publishAgendaActivated(result);
    return result;
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
