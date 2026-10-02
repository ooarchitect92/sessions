import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  SessionStatus,
  type Session,
} from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import {
  HOST_ROLES,
  hasAnyRole,
  type Principal,
} from '../common/auth/principal';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { OutboxService } from '../outbox/outbox.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { ListSessionsQuery } from './dto/list-sessions.query';
import { UpdateSessionDto } from './dto/update-session.dto';
import { allowedSourceStatuses } from './session-state-machine';

export type SessionWithAgenda = Prisma.SessionGetPayload<{
  include: { agendaItems: true };
}>;

@Injectable()
export class SessionsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async create(
    principal: Principal,
    input: CreateSessionDto,
    idempotencyKey: string,
  ): Promise<Session | Prisma.JsonObject> {
    this.assertHost(principal);
    this.assertTimeZone(input.timezone);
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ operation: 'session.create', input }))
      .digest('hex');

    return this.database.run(principal, async (transaction) => {
      const idempotencyLock = `session.create:${principal.workspaceId}:${idempotencyKey}`;
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${idempotencyLock}, 0))`;

      const existing = await transaction.idempotencyKey.findUnique({
        where: {
          workspaceId_key: {
            workspaceId: principal.workspaceId,
            key: idempotencyKey,
          },
        },
      });

      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new ConflictException(
            'This idempotency key was already used with a different request',
          );
        }
        return existing.response as Prisma.JsonObject;
      }

      if (input.roomId) {
        const room = await transaction.room.findUnique({ where: { id: input.roomId } });
        if (!room) throw new BadRequestException('The selected room does not exist');
      }

      const id = randomUUID();
      const session = await transaction.session.create({
        data: {
          id,
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          ...(input.roomId ? { roomId: input.roomId } : {}),
          createdById: principal.userId,
          title: input.title.trim(),
          description: input.description?.trim() || null,
          kind: input.kind,
          status: SessionStatus.DRAFT,
          startsAt: new Date(input.startsAt),
          durationMinutes: input.durationMinutes,
          timezone: input.timezone,
          recordingEnabled: input.recordingEnabled,
          transcriptionEnabled: input.transcriptionEnabled,
          livekitRoomName: `session-${id}`,
        },
      });

      const serialized = this.toJson(session);
      await this.audit.record(transaction, principal, {
        action: 'session.created',
        resourceType: 'session',
        resourceId: session.id,
        metadata: { status: session.status, kind: session.kind },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'session',
        aggregateId: session.id,
        eventType: 'session.created',
        payload: serialized,
      });
      await transaction.idempotencyKey.create({
        data: {
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          key: idempotencyKey,
          requestHash,
          response: serialized,
          statusCode: 201,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      return session;
    });
  }

  async list(
    principal: Principal,
    query: ListSessionsQuery,
  ): Promise<{ items: Session[]; page: number; pageSize: number; total: number }> {
    return this.database.run(principal, async (transaction) => {
      const where: Prisma.SessionWhereInput = query.status ? { status: query.status } : {};
      const [items, total] = await Promise.all([
        transaction.session.findMany({
          where,
          orderBy: [{ startsAt: 'asc' }, { createdAt: 'desc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        transaction.session.count({ where }),
      ]);
      return { items, page: query.page, pageSize: query.pageSize, total };
    });
  }

  async getById(principal: Principal, id: string): Promise<SessionWithAgenda> {
    return this.database.run(principal, async (transaction) => {
      const session = await transaction.session.findUnique({
        where: { id },
        include: { agendaItems: { orderBy: { position: 'asc' } } },
      });
      if (!session) throw new NotFoundException('Session not found');
      return session;
    });
  }

  async update(
    principal: Principal,
    id: string,
    expectedVersion: number,
    input: UpdateSessionDto,
  ): Promise<Session> {
    this.assertHost(principal);
    if (Object.keys(input).length === 0) {
      throw new BadRequestException('At least one session field must be supplied');
    }
    if (input.timezone !== undefined) this.assertTimeZone(input.timezone);

    return this.database.run(principal, async (transaction) => {
      if (input.roomId) {
        const room = await transaction.room.findUnique({ where: { id: input.roomId } });
        if (!room) throw new BadRequestException('The selected room does not exist');
      }

      const data: Prisma.SessionUpdateManyMutationInput = {
        version: { increment: 1 },
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.description !== undefined
          ? { description: input.description?.trim() || null }
          : {}),
        ...(input.kind !== undefined ? { kind: input.kind } : {}),
        ...(input.startsAt !== undefined ? { startsAt: new Date(input.startsAt) } : {}),
        ...(input.durationMinutes !== undefined
          ? { durationMinutes: input.durationMinutes }
          : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
        ...(input.roomId !== undefined ? { roomId: input.roomId } : {}),
        ...(input.recordingEnabled !== undefined
          ? { recordingEnabled: input.recordingEnabled }
          : {}),
        ...(input.transcriptionEnabled !== undefined
          ? { transcriptionEnabled: input.transcriptionEnabled }
          : {}),
      };

      const result = await transaction.session.updateMany({
        where: {
          id,
          version: expectedVersion,
          status: { in: [SessionStatus.DRAFT, SessionStatus.SCHEDULED] },
        },
        data,
      });
      if (result.count === 0) {
        await this.throwSessionUpdateConflict(transaction, id, expectedVersion);
      }

      const session = await transaction.session.findUniqueOrThrow({ where: { id } });
      await this.audit.record(transaction, principal, {
        action: 'session.updated',
        resourceType: 'session',
        resourceId: id,
        metadata: { previousVersion: expectedVersion, version: session.version },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'session',
        aggregateId: id,
        eventType: 'session.updated',
        payload: this.toJson(session),
      });
      return session;
    });
  }

  async publish(principal: Principal, id: string, expectedVersion: number): Promise<Session> {
    return this.transition(
      principal,
      id,
      expectedVersion,
      allowedSourceStatuses(SessionStatus.SCHEDULED),
      SessionStatus.SCHEDULED,
      'session.scheduled',
    );
  }

  async start(principal: Principal, id: string, expectedVersion: number): Promise<Session> {
    return this.transition(
      principal,
      id,
      expectedVersion,
      allowedSourceStatuses(SessionStatus.LIVE),
      SessionStatus.LIVE,
      'session.started',
    );
  }

  async end(principal: Principal, id: string, expectedVersion: number): Promise<Session> {
    return this.transition(
      principal,
      id,
      expectedVersion,
      allowedSourceStatuses(SessionStatus.ENDED),
      SessionStatus.ENDED,
      'session.ended',
    );
  }

  async cancel(principal: Principal, id: string, expectedVersion: number): Promise<Session> {
    return this.transition(
      principal,
      id,
      expectedVersion,
      allowedSourceStatuses(SessionStatus.CANCELLED),
      SessionStatus.CANCELLED,
      'session.cancelled',
    );
  }

  private async transition(
    principal: Principal,
    id: string,
    expectedVersion: number,
    from: SessionStatus[],
    to: SessionStatus,
    eventType: string,
  ): Promise<Session> {
    this.assertHost(principal);
    return this.database.run(principal, async (transaction) => {
      const result = await transaction.session.updateMany({
        where: { id, version: expectedVersion, status: { in: from } },
        data: { status: to, version: { increment: 1 } },
      });
      if (result.count === 0) {
        const current = await transaction.session.findUnique({ where: { id } });
        if (!current) throw new NotFoundException('Session not found');
        if (current.version !== expectedVersion) {
          throw new ConflictException(`Version conflict. Current version is ${current.version}`);
        }
        throw new ConflictException(
          `Session cannot move from ${current.status} to ${to}`,
        );
      }

      const session = await transaction.session.findUniqueOrThrow({ where: { id } });
      await this.audit.record(transaction, principal, {
        action: eventType,
        resourceType: 'session',
        resourceId: id,
        metadata: { from, to, version: session.version },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'session',
        aggregateId: id,
        eventType,
        payload: this.toJson(session),
      });
      return session;
    });
  }

  private async throwSessionUpdateConflict(
    transaction: Prisma.TransactionClient,
    id: string,
    expectedVersion: number,
  ): Promise<never> {
    const current = await transaction.session.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Session not found');
    if (current.version !== expectedVersion) {
      throw new ConflictException(`Version conflict. Current version is ${current.version}`);
    }
    throw new ConflictException(`A ${current.status} session cannot be edited`);
  }

  private assertTimeZone(timezone: string): void {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    } catch {
      throw new BadRequestException('timezone must be a valid IANA timezone');
    }
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
