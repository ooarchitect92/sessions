import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Room } from '@prisma/client';
import { createHash } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { HOST_ROLES, hasAnyRole, type Principal } from '../common/auth/principal';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { OutboxService } from '../outbox/outbox.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';

@Injectable()
export class RoomsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async list(principal: Principal): Promise<Room[]> {
    return this.database.run(principal, (transaction) =>
      transaction.room.findMany({ orderBy: [{ title: 'asc' }, { createdAt: 'asc' }] }),
    );
  }

  async getById(principal: Principal, id: string): Promise<Room> {
    return this.database.run(principal, async (transaction) => {
      const room = await transaction.room.findUnique({ where: { id } });
      if (!room) throw new NotFoundException('Room not found');
      return room;
    });
  }

  async create(
    principal: Principal,
    input: CreateRoomDto,
    idempotencyKey: string,
  ): Promise<Room | Prisma.JsonObject> {
    this.assertHost(principal);
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ operation: 'room.create', input }))
      .digest('hex');

    return this.database.run(principal, async (transaction) => {
      const idempotencyLock = `room.create:${principal.workspaceId}:${idempotencyKey}`;
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${idempotencyLock}, 0))`;

      const existing = await transaction.idempotencyKey.findUnique({
        where: {
          workspaceId_key: { workspaceId: principal.workspaceId, key: idempotencyKey },
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

      const conflicting = await transaction.room.findUnique({
        where: { workspaceId_slug: { workspaceId: principal.workspaceId, slug: input.slug } },
        select: { id: true },
      });
      if (conflicting) throw new ConflictException('A room with this slug already exists');

      let room: Room;
      try {
        room = await transaction.room.create({
          data: {
            organizationId: principal.organizationId,
            workspaceId: principal.workspaceId,
            title: input.title.trim(),
            slug: input.slug,
            settings: input.settings as Prisma.InputJsonValue,
          },
        });
      } catch (error: unknown) {
        this.rethrowRoomConstraint(error);
      }
      const serialized = this.toJson(room);
      await this.audit.record(transaction, principal, {
        action: 'room.created',
        resourceType: 'room',
        resourceId: room.id,
        metadata: { slug: room.slug },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'room',
        aggregateId: room.id,
        eventType: 'room.created',
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
      return room;
    });
  }

  async update(
    principal: Principal,
    id: string,
    expectedVersion: number,
    input: UpdateRoomDto,
  ): Promise<Room> {
    this.assertHost(principal);
    if (Object.keys(input).length === 0) {
      throw new BadRequestException('At least one room field must be supplied');
    }

    return this.database.run(principal, async (transaction) => {
      if (input.slug !== undefined) {
        const conflicting = await transaction.room.findFirst({
          where: { workspaceId: principal.workspaceId, slug: input.slug, id: { not: id } },
          select: { id: true },
        });
        if (conflicting) throw new ConflictException('A room with this slug already exists');
      }

      let result: Prisma.BatchPayload;
      try {
        result = await transaction.room.updateMany({
          where: { id, version: expectedVersion },
          data: {
            version: { increment: 1 },
            ...(input.title !== undefined ? { title: input.title.trim() } : {}),
            ...(input.slug !== undefined ? { slug: input.slug } : {}),
            ...(input.settings !== undefined
              ? { settings: input.settings as Prisma.InputJsonValue }
              : {}),
          },
        });
      } catch (error: unknown) {
        this.rethrowRoomConstraint(error);
      }
      if (result.count === 0) {
        const current = await transaction.room.findUnique({ where: { id } });
        if (!current) throw new NotFoundException('Room not found');
        throw new ConflictException(`Version conflict. Current version is ${current.version}`);
      }

      const room = await transaction.room.findUniqueOrThrow({ where: { id } });
      await this.audit.record(transaction, principal, {
        action: 'room.updated',
        resourceType: 'room',
        resourceId: room.id,
        metadata: { previousVersion: expectedVersion, version: room.version },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'room',
        aggregateId: room.id,
        eventType: 'room.updated',
        payload: this.toJson(room),
      });
      return room;
    });
  }

  async remove(principal: Principal, id: string, expectedVersion: number): Promise<{ id: string }> {
    this.assertHost(principal);
    return this.database.run(principal, async (transaction) => {
      const inUse = await transaction.session.count({ where: { roomId: id } });
      if (inUse > 0) {
        throw new ConflictException('A room used by sessions cannot be deleted');
      }
      const result = await transaction.room.deleteMany({ where: { id, version: expectedVersion } });
      if (result.count === 0) {
        const current = await transaction.room.findUnique({ where: { id } });
        if (!current) throw new NotFoundException('Room not found');
        throw new ConflictException(`Version conflict. Current version is ${current.version}`);
      }
      await this.audit.record(transaction, principal, {
        action: 'room.deleted',
        resourceType: 'room',
        resourceId: id,
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'room',
        aggregateId: id,
        eventType: 'room.deleted',
        payload: { id },
      });
      return { id };
    });
  }

  private rethrowRoomConstraint(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('A room with this slug already exists');
    }
    throw error;
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
