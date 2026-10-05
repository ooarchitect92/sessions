import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AgendaItemType,
  AgendaTimerStatus,
  FileAssetStatus,
  Prisma,
  SessionStatus,
  type AgendaItem,
} from '@prisma/client';
import { OpenAiCompatibleAgendaProvider } from '../ai/openai-compatible-agenda.provider';
import { AuditService } from '../audit/audit.service';
import {
  HOST_ROLES,
  hasAnyRole,
  type Principal,
} from '../common/auth/principal';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { RealtimeEventsService } from '../infrastructure/realtime-events.service';
import { OutboxService } from '../outbox/outbox.service';
import { AgendaContentPolicyService } from './agenda-content-policy.service';
import {
  resolveAgendaTimerSnapshot,
  transitionAgendaTimer,
  type AgendaTimerAction,
} from './agenda-timer';
import { CreateAgendaItemDto } from './dto/create-agenda-item.dto';
import { GenerateAgendaDto } from './dto/generate-agenda.dto';
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
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly contentPolicy: AgendaContentPolicyService,
    private readonly agendaGenerator: OpenAiCompatibleAgendaProvider,
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

  async getTimer(principal: Principal, sessionId: string) {
    return this.database.run(principal, async (transaction) => {
      const session = await transaction.session.findUnique({
        where: { id: sessionId },
        select: {
          id: true,
          status: true,
          currentAgendaItemId: true,
          agendaTimerStatus: true,
          agendaTimerRemainingSeconds: true,
          agendaTimerEndsAt: true,
          agendaTimerStartedAt: true,
        },
      });
      if (!session) throw new NotFoundException('Session not found');

      const item = session.currentAgendaItemId
        ? await transaction.agendaItem.findFirst({
            where: {
              id: session.currentAgendaItemId,
              sessionId,
            },
            select: { id: true, durationSeconds: true },
          })
        : null;

      const now = new Date();
      const resolved = resolveAgendaTimerSnapshot(
        {
          status: session.agendaTimerStatus,
          remainingSeconds: session.agendaTimerRemainingSeconds,
          endsAt: session.agendaTimerEndsAt,
          startedAt: session.agendaTimerStartedAt,
        },
        now,
      );

      return {
        sessionId,
        agendaItemId: item?.id ?? null,
        durationSeconds: item?.durationSeconds ?? 0,
        status: item ? resolved.status : AgendaTimerStatus.IDLE,
        remainingSeconds: item ? resolved.remainingSeconds : 0,
        endsAt: item && resolved.endsAt ? resolved.endsAt.toISOString() : null,
        startedAt:
          item && resolved.startedAt ? resolved.startedAt.toISOString() : null,
        serverTime: now.toISOString(),
      };
    });
  }

  async controlTimer(
    principal: Principal,
    sessionId: string,
    action: AgendaTimerAction,
  ) {
    this.assertHost(principal);

    const state = await this.database.run(principal, async (transaction) => {
      const session = await transaction.session.findUnique({
        where: { id: sessionId },
        select: {
          id: true,
          status: true,
          currentAgendaItemId: true,
          agendaTimerStatus: true,
          agendaTimerRemainingSeconds: true,
          agendaTimerEndsAt: true,
          agendaTimerStartedAt: true,
        },
      });
      if (!session) throw new NotFoundException('Session not found');
      if (!ACTIVATABLE_SESSION_STATUSES.has(session.status)) {
        throw new BadRequestException(
          `Agenda timer is unavailable while session is ${session.status}`,
        );
      }
      if (!session.currentAgendaItemId) {
        throw new BadRequestException(
          'Activate an agenda item before controlling the timer',
        );
      }

      const item = await transaction.agendaItem.findFirst({
        where: { id: session.currentAgendaItemId, sessionId },
        select: { id: true, durationSeconds: true },
      });
      if (!item) throw new NotFoundException('Active agenda item not found');

      const now = new Date();
      const next = transitionAgendaTimer(
        {
          status: session.agendaTimerStatus,
          remainingSeconds: session.agendaTimerRemainingSeconds,
          endsAt: session.agendaTimerEndsAt,
          startedAt: session.agendaTimerStartedAt,
        },
        action,
        item.durationSeconds,
        now,
      );

      await transaction.session.update({
        where: { id: sessionId },
        data: {
          agendaTimerStatus: next.status,
          agendaTimerRemainingSeconds: next.remainingSeconds,
          agendaTimerEndsAt: next.endsAt,
          agendaTimerStartedAt: next.startedAt,
        },
      });

      const payload = {
        sessionId,
        agendaItemId: item.id,
        durationSeconds: item.durationSeconds,
        status: next.status,
        remainingSeconds: next.remainingSeconds,
        endsAt: next.endsAt?.toISOString() ?? null,
        startedAt: next.startedAt?.toISOString() ?? null,
        serverTime: now.toISOString(),
      };

      await this.audit.record(transaction, principal, {
        action: `agenda_timer.${action.toLowerCase()}`,
        resourceType: 'session',
        resourceId: sessionId,
        metadata: {
          agendaItemId: item.id,
          status: next.status,
          remainingSeconds: next.remainingSeconds,
        },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'session',
        aggregateId: sessionId,
        eventType: `agenda.timer.${action.toLowerCase()}`,
        payload: this.toJson(payload),
      });

      return payload;
    });

    this.realtimeEvents.publishSessionEvent({
      sessionId,
      eventName: 'agenda.timer.updated',
      payload: state,
    });
    return state;
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

      let normalizedContent: Prisma.InputJsonObject;
      if (input.type === AgendaItemType.FILE) {
        const fileId =
          typeof input.content.fileId === 'string'
            ? input.content.fileId.trim()
            : '';
        if (
          !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            fileId,
          )
        ) {
          throw new BadRequestException(
            'File agenda items require a valid fileId',
          );
        }
        const file = await transaction.fileAsset.findFirst({
          where: {
            id: fileId,
            sessionId,
            status: FileAssetStatus.READY,
          },
          select: {
            id: true,
            filename: true,
            mimeType: true,
            sizeBytes: true,
          },
        });
        if (!file) {
          throw new BadRequestException(
            'The selected file must belong to this session and pass malware scanning before it can be added to the agenda',
          );
        }
        normalizedContent = {
          fileId: file.id,
          filename: file.filename,
          mimeType: file.mimeType,
          sizeBytes: Number(file.sizeBytes),
        };
      } else {
        normalizedContent = this.contentPolicy.normalize(
          input.type,
          input.content,
        );
      }

      const item = await transaction.agendaItem.create({
        data: {
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          sessionId,
          position: (last?.position ?? -1) + 1,
          title: input.title.trim(),
          durationSeconds: input.durationSeconds,
          type: input.type,
          content: normalizedContent,
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

  async generate(
    principal: Principal,
    sessionId: string,
    input: GenerateAgendaDto,
  ) {
    this.assertHost(principal);
    return this.database.run(principal, async (transaction) => {
      const session = await transaction.session.findUnique({
        where: { id: sessionId },
        select: {
          id: true,
          title: true,
          description: true,
          durationMinutes: true,
          status: true,
        },
      });
      if (!session) throw new NotFoundException('Session not found');
      if (!EDITABLE_SESSION_STATUSES.has(session.status)) {
        throw new BadRequestException(
          `Agenda cannot be generated while session is ${session.status}`,
        );
      }

      const generated = await this.agendaGenerator.generate({
        sessionTitle: session.title,
        sessionDescription: session.description,
        durationMinutes: session.durationMinutes,
        objective: input.objective.trim(),
        desiredItems: input.desiredItems,
      });

      await this.audit.record(transaction, principal, {
        action: 'agenda.generated',
        resourceType: 'session',
        resourceId: sessionId,
        metadata: {
          provider: generated.provider,
          model: generated.model,
          suggestedItems: generated.items.length,
        },
      });

      return {
        sessionId,
        provider: generated.provider,
        model: generated.model,
        items: generated.items,
      };
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
        data: {
          currentAgendaItemId: agendaItemId,
          agendaTimerStatus: AgendaTimerStatus.IDLE,
          agendaTimerRemainingSeconds: item.durationSeconds,
          agendaTimerEndsAt: null,
          agendaTimerStartedAt: null,
          version: { increment: 1 },
        },
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
    this.realtimeEvents.publishSessionEvent({
      sessionId,
      eventName: 'agenda.timer.updated',
      payload: {
        sessionId,
        agendaItemId: result.agendaItem.id,
        durationSeconds: result.agendaItem.durationSeconds,
        status: AgendaTimerStatus.IDLE,
        remainingSeconds: result.agendaItem.durationSeconds,
        endsAt: null,
        startedAt: null,
        serverTime: result.activatedAt,
      },
    });
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
