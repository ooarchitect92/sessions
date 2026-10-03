import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SessionStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import {
  HOST_ROLES,
  hasAnyRole,
  type Principal,
} from '../common/auth/principal';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { OutboxService } from '../outbox/outbox.service';
import { SaveAgendaTemplateDto } from './dto/save-agenda-template.dto';
import { UpdateAgendaTemplateDto } from './dto/update-agenda-template.dto';

const EDITABLE_SESSION_STATUSES = new Set<SessionStatus>([
  SessionStatus.DRAFT,
  SessionStatus.SCHEDULED,
]);

@Injectable()
export class AgendaTemplatesService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async list(principal: Principal) {
    return this.database.run(principal, (transaction) =>
      transaction.agendaTemplate.findMany({
        include: {
          items: { orderBy: { position: 'asc' } },
          createdBy: { select: { id: true, displayName: true } },
        },
        orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
      }),
    );
  }

  async getById(principal: Principal, id: string) {
    return this.database.run(principal, async (transaction) => {
      const template = await transaction.agendaTemplate.findUnique({
        where: { id },
        include: {
          items: { orderBy: { position: 'asc' } },
          createdBy: { select: { id: true, displayName: true } },
        },
      });
      if (!template) throw new NotFoundException('Agenda template not found');
      return template;
    });
  }

  async saveFromSession(
    principal: Principal,
    sessionId: string,
    input: SaveAgendaTemplateDto,
  ) {
    this.assertHost(principal);

    return this.database.run(principal, async (transaction) => {
      const session = await transaction.session.findUnique({
        where: { id: sessionId },
        include: { agendaItems: { orderBy: { position: 'asc' } } },
      });
      if (!session) throw new NotFoundException('Session not found');
      if (session.agendaItems.length === 0) {
        throw new BadRequestException(
          'Add at least one agenda item before saving a template',
        );
      }

      try {
        const template = await transaction.agendaTemplate.create({
          data: {
            organizationId: principal.organizationId,
            workspaceId: principal.workspaceId,
            createdById: principal.userId,
            name: input.name.trim(),
            description: input.description?.trim() || null,
            items: {
              create: session.agendaItems.map((item) => ({
                organizationId: principal.organizationId,
                workspaceId: principal.workspaceId,
                position: item.position,
                title: item.title,
                durationSeconds: item.durationSeconds,
                type: item.type,
                content: item.content as Prisma.InputJsonValue,
              })),
            },
          },
          include: {
            items: { orderBy: { position: 'asc' } },
            createdBy: { select: { id: true, displayName: true } },
          },
        });

        await this.audit.record(transaction, principal, {
          action: 'agenda_template.created',
          resourceType: 'agenda_template',
          resourceId: template.id,
          metadata: {
            sourceSessionId: sessionId,
            itemCount: template.items.length,
          },
        });
        await this.outbox.enqueue(transaction, principal, {
          aggregateType: 'agenda_template',
          aggregateId: template.id,
          eventType: 'agenda.template.created',
          payload: {
            agendaTemplateId: template.id,
            name: template.name,
            itemCount: template.items.length,
          },
        });
        return template;
      } catch (error: unknown) {
        this.rethrowUniqueName(error);
      }
    });
  }

  async update(
    principal: Principal,
    id: string,
    expectedVersion: number,
    input: UpdateAgendaTemplateDto,
  ) {
    this.assertHost(principal);
    if (Object.keys(input).length === 0) {
      throw new BadRequestException('At least one template field is required');
    }

    return this.database.run(principal, async (transaction) => {
      try {
        const result = await transaction.agendaTemplate.updateMany({
          where: { id, version: expectedVersion },
          data: {
            version: { increment: 1 },
            ...(input.name !== undefined ? { name: input.name.trim() } : {}),
            ...(input.description !== undefined
              ? { description: input.description.trim() || null }
              : {}),
          },
        });
        if (result.count === 0) {
          const current = await transaction.agendaTemplate.findUnique({
            where: { id },
            select: { version: true },
          });
          if (!current) throw new NotFoundException('Agenda template not found');
          throw new ConflictException(
            `Version conflict. Current version is ${current.version}`,
          );
        }

        const template = await transaction.agendaTemplate.findUniqueOrThrow({
          where: { id },
          include: {
            items: { orderBy: { position: 'asc' } },
            createdBy: { select: { id: true, displayName: true } },
          },
        });
        await this.audit.record(transaction, principal, {
          action: 'agenda_template.updated',
          resourceType: 'agenda_template',
          resourceId: id,
          metadata: { previousVersion: expectedVersion, version: template.version },
        });
        await this.outbox.enqueue(transaction, principal, {
          aggregateType: 'agenda_template',
          aggregateId: id,
          eventType: 'agenda.template.updated',
          payload: {
            agendaTemplateId: id,
            name: template.name,
            version: template.version,
          },
        });
        return template;
      } catch (error: unknown) {
        this.rethrowUniqueName(error);
      }
    });
  }

  async remove(
    principal: Principal,
    id: string,
    expectedVersion: number,
  ): Promise<{ id: string }> {
    this.assertHost(principal);

    return this.database.run(principal, async (transaction) => {
      const result = await transaction.agendaTemplate.deleteMany({
        where: { id, version: expectedVersion },
      });
      if (result.count === 0) {
        const current = await transaction.agendaTemplate.findUnique({
          where: { id },
          select: { version: true },
        });
        if (!current) throw new NotFoundException('Agenda template not found');
        throw new ConflictException(
          `Version conflict. Current version is ${current.version}`,
        );
      }

      await this.audit.record(transaction, principal, {
        action: 'agenda_template.deleted',
        resourceType: 'agenda_template',
        resourceId: id,
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'agenda_template',
        aggregateId: id,
        eventType: 'agenda.template.deleted',
        payload: { id },
      });
      return { id };
    });
  }

  async applyToSession(
    principal: Principal,
    sessionId: string,
    templateId: string,
  ) {
    this.assertHost(principal);

    return this.database.run(principal, async (transaction) => {
      const session = await transaction.session.findUnique({
        where: { id: sessionId },
        select: { status: true },
      });
      if (!session) throw new NotFoundException('Session not found');
      if (!EDITABLE_SESSION_STATUSES.has(session.status)) {
        throw new ConflictException(
          `Agenda templates cannot be applied while session is ${session.status}`,
        );
      }

      const template = await transaction.agendaTemplate.findUnique({
        where: { id: templateId },
        include: { items: { orderBy: { position: 'asc' } } },
      });
      if (!template) throw new NotFoundException('Agenda template not found');
      if (template.items.length === 0) {
        throw new BadRequestException('The agenda template has no items');
      }

      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${sessionId}, 0))`;
      const last = await transaction.agendaItem.findFirst({
        where: { sessionId },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      const startPosition = (last?.position ?? -1) + 1;

      await transaction.agendaItem.createMany({
        data: template.items.map((item, index) => ({
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          sessionId,
          position: startPosition + index,
          title: item.title,
          durationSeconds: item.durationSeconds,
          type: item.type,
          content: item.content as Prisma.InputJsonValue,
        })),
      });

      const agendaItems = await transaction.agendaItem.findMany({
        where: { sessionId },
        orderBy: { position: 'asc' },
      });
      await this.audit.record(transaction, principal, {
        action: 'agenda_template.applied',
        resourceType: 'agenda_template',
        resourceId: templateId,
        metadata: {
          sessionId,
          appendedItemCount: template.items.length,
        },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'session',
        aggregateId: sessionId,
        eventType: 'agenda.template.applied',
        payload: {
          sessionId,
          agendaTemplateId: templateId,
          appendedItemCount: template.items.length,
        },
      });
      return {
        sessionId,
        agendaTemplateId: templateId,
        appendedItemCount: template.items.length,
        agendaItems,
      };
    });
  }

  private assertHost(principal: Principal): void {
    if (!hasAnyRole(principal, HOST_ROLES)) {
      throw new ForbiddenException('A host role is required');
    }
  }

  private rethrowUniqueName(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'An agenda template with this name already exists in the workspace',
      );
    }
    throw error;
  }
}
