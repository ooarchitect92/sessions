import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BreakoutRoomStatus, Prisma, SessionStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import {
  HOST_ROLES,
  hasAnyRole,
  type Principal,
} from '../common/auth/principal';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { RealtimeEventsService } from '../infrastructure/realtime-events.service';
import { OutboxService } from '../outbox/outbox.service';
import { distributeParticipants } from './breakout-distribution';
import { AssignBreakoutRoomDto } from './dto/assign-breakout-room.dto';
import { BroadcastBreakoutDto } from './dto/broadcast-breakout.dto';
import { CreateBreakoutRoomDto } from './dto/create-breakout-room.dto';
import { RandomizeBreakoutsDto } from './dto/randomize-breakouts.dto';

const MANAGEABLE_SESSION_STATUSES = new Set<SessionStatus>([
  SessionStatus.DRAFT,
  SessionStatus.SCHEDULED,
  SessionStatus.LIVE,
]);

@Injectable()
export class BreakoutsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly realtime: RealtimeEventsService,
  ) {}

  async list(principal: Principal, sessionId: string) {
    return this.database.run(principal, async (transaction) => {
      await this.assertSessionExists(transaction, sessionId);
      return transaction.breakoutRoom.findMany({
        where: { sessionId },
        orderBy: { position: 'asc' },
        include: {
          assignments: {
            orderBy: { assignedAt: 'asc' },
            include: {
              user: {
                select: {
                  id: true,
                  displayName: true,
                  avatarUrl: true,
                },
              },
            },
          },
        },
      });
    });
  }

  async create(
    principal: Principal,
    sessionId: string,
    input: CreateBreakoutRoomDto,
  ) {
    this.assertHost(principal);
    const room = await this.database.run(principal, async (transaction) => {
      const session = await this.assertSessionManageable(transaction, sessionId);
      const existing = await transaction.breakoutRoom.findFirst({
        where: { sessionId, position: input.position },
      });
      if (existing) {
        throw new ConflictException('A breakout room already uses that position');
      }
      const created = await transaction.breakoutRoom.create({
        data: {
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          sessionId,
          name: input.name.trim(),
          position: input.position,
          livekitRoomName: `${session.livekitRoomName}--breakout-${input.position + 1}`,
        },
      });
      await this.audit.record(transaction, principal, {
        action: 'breakout_room.created',
        resourceType: 'breakout_room',
        resourceId: created.id,
        metadata: { sessionId, position: created.position, name: created.name },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'breakout_room',
        aggregateId: created.id,
        eventType: 'breakout.room.created',
        payload: this.toJson(created),
      });
      return created;
    });
    this.realtime.publishSessionEvent({
      sessionId,
      eventName: 'breakout.updated',
      payload: { sessionId, reason: 'room_created', breakoutRoomId: room.id },
    });
    return room;
  }

  async assign(
    principal: Principal,
    sessionId: string,
    breakoutRoomId: string,
    input: AssignBreakoutRoomDto,
  ) {
    this.assertHost(principal);
    const result = await this.database.run(principal, async (transaction) => {
      await this.assertSessionManageable(transaction, sessionId);
      const room = await transaction.breakoutRoom.findFirst({
        where: { id: breakoutRoomId, sessionId },
      });
      if (!room) throw new NotFoundException('Breakout room not found');

      const memberships = input.userIds.length
        ? await transaction.workspaceMembership.findMany({
            where: {
              workspaceId: principal.workspaceId,
              userId: { in: input.userIds },
            },
            select: { userId: true },
          })
        : [];
      if (memberships.length !== input.userIds.length) {
        throw new ConflictException(
          'Every breakout participant must belong to the current workspace',
        );
      }

      await transaction.breakoutAssignment.deleteMany({
        where: { breakoutRoomId },
      });
      if (input.userIds.length) {
        await transaction.breakoutAssignment.createMany({
          data: input.userIds.map((userId) => ({
            organizationId: principal.organizationId,
            workspaceId: principal.workspaceId,
            sessionId,
            breakoutRoomId,
            userId,
          })),
        });
      }

      await this.audit.record(transaction, principal, {
        action: 'breakout_room.assignments_updated',
        resourceType: 'breakout_room',
        resourceId: breakoutRoomId,
        metadata: { sessionId, userIds: input.userIds },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'breakout_room',
        aggregateId: breakoutRoomId,
        eventType: 'breakout.assignments.updated',
        payload: { sessionId, breakoutRoomId, userIds: input.userIds },
      });

      return transaction.breakoutRoom.findUniqueOrThrow({
        where: { id: breakoutRoomId },
        include: {
          assignments: {
            include: {
              user: {
                select: { id: true, displayName: true, avatarUrl: true },
              },
            },
          },
        },
      });
    });
    this.realtime.publishSessionEvent({
      sessionId,
      eventName: 'breakout.updated',
      payload: {
        sessionId,
        reason: 'assignments_updated',
        breakoutRoomId,
      },
    });
    return result;
  }

  async randomize(
    principal: Principal,
    sessionId: string,
    input: RandomizeBreakoutsDto,
  ) {
    this.assertHost(principal);
    const rooms = await this.database.run(principal, async (transaction) => {
      await this.assertSessionManageable(transaction, sessionId);
      const availableRooms = await transaction.breakoutRoom.findMany({
        where: { sessionId, status: BreakoutRoomStatus.DRAFT },
        orderBy: { position: 'asc' },
      });
      if (!availableRooms.length) {
        throw new ConflictException('Create draft breakout rooms before randomizing');
      }
      const memberships = await transaction.workspaceMembership.findMany({
        where: {
          workspaceId: principal.workspaceId,
          userId: { in: input.userIds },
        },
        select: { userId: true },
      });
      if (memberships.length !== input.userIds.length) {
        throw new ConflictException(
          'Every breakout participant must belong to the current workspace',
        );
      }

      const distribution = distributeParticipants(
        input.userIds,
        availableRooms.map((room) => room.id),
      );
      await transaction.breakoutAssignment.deleteMany({ where: { sessionId } });
      const rows = [...distribution.entries()].flatMap(([breakoutRoomId, userIds]) =>
        userIds.map((userId) => ({
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          sessionId,
          breakoutRoomId,
          userId,
        })),
      );
      if (rows.length) {
        await transaction.breakoutAssignment.createMany({ data: rows });
      }

      await this.audit.record(transaction, principal, {
        action: 'breakout.assignments_randomized',
        resourceType: 'session',
        resourceId: sessionId,
        metadata: {
          participantCount: input.userIds.length,
          breakoutRoomIds: availableRooms.map((room) => room.id),
        },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'session',
        aggregateId: sessionId,
        eventType: 'breakout.assignments.randomized',
        payload: {
          sessionId,
          participantCount: input.userIds.length,
          breakoutRoomIds: availableRooms.map((room) => room.id),
        },
      });
      return availableRooms;
    });

    this.realtime.publishSessionEvent({
      sessionId,
      eventName: 'breakout.updated',
      payload: { sessionId, reason: 'assignments_randomized' },
    });
    return { sessionId, roomCount: rooms.length, participantCount: input.userIds.length };
  }

  async start(principal: Principal, sessionId: string) {
    this.assertHost(principal);
    const result = await this.database.run(principal, async (transaction) => {
      const session = await this.assertSessionManageable(transaction, sessionId);
      if (session.status !== SessionStatus.LIVE) {
        throw new ConflictException('Breakout rooms can start only during a live session');
      }
      const count = await transaction.breakoutRoom.count({ where: { sessionId } });
      if (!count) throw new ConflictException('Create breakout rooms first');

      await transaction.breakoutRoom.updateMany({
        where: { sessionId },
        data: { status: BreakoutRoomStatus.ACTIVE },
      });
      await this.audit.record(transaction, principal, {
        action: 'breakout.started',
        resourceType: 'session',
        resourceId: sessionId,
        metadata: { roomCount: count },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'session',
        aggregateId: sessionId,
        eventType: 'breakout.started',
        payload: { sessionId, roomCount: count },
      });
      return { sessionId, roomCount: count, status: 'ACTIVE' as const };
    });
    this.realtime.publishSessionEvent({
      sessionId,
      eventName: 'breakout.started',
      payload: result,
    });
    return result;
  }

  async close(principal: Principal, sessionId: string) {
    this.assertHost(principal);
    const result = await this.database.run(principal, async (transaction) => {
      await this.assertSessionExists(transaction, sessionId);
      const count = await transaction.breakoutRoom.count({
        where: { sessionId, status: BreakoutRoomStatus.ACTIVE },
      });
      await transaction.breakoutRoom.updateMany({
        where: { sessionId },
        data: { status: BreakoutRoomStatus.CLOSED },
      });
      await this.audit.record(transaction, principal, {
        action: 'breakout.closed',
        resourceType: 'session',
        resourceId: sessionId,
        metadata: { roomCount: count },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'session',
        aggregateId: sessionId,
        eventType: 'breakout.closed',
        payload: { sessionId, roomCount: count },
      });
      return { sessionId, roomCount: count, status: 'CLOSED' as const };
    });
    this.realtime.publishSessionEvent({
      sessionId,
      eventName: 'breakout.closed',
      payload: result,
    });
    return result;
  }

  async broadcast(
    principal: Principal,
    sessionId: string,
    input: BroadcastBreakoutDto,
  ) {
    this.assertHost(principal);
    await this.database.run(principal, async (transaction) => {
      await this.assertSessionExists(transaction, sessionId);
      await this.audit.record(transaction, principal, {
        action: 'breakout.broadcast_sent',
        resourceType: 'session',
        resourceId: sessionId,
        metadata: { message: input.message.trim() },
      });
    });
    const payload = {
      sessionId,
      message: input.message.trim(),
      sentByUserId: principal.userId,
      sentByDisplayName: principal.displayName,
      sentAt: new Date().toISOString(),
    };
    this.realtime.publishSessionEvent({
      sessionId,
      eventName: 'breakout.broadcast',
      payload,
    });
    return payload;
  }

  private async assertSessionExists(
    transaction: Prisma.TransactionClient,
    sessionId: string,
  ) {
    const session = await transaction.session.findUnique({
      where: { id: sessionId },
      select: { id: true, status: true, livekitRoomName: true },
    });
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  private async assertSessionManageable(
    transaction: Prisma.TransactionClient,
    sessionId: string,
  ) {
    const session = await this.assertSessionExists(transaction, sessionId);
    if (!MANAGEABLE_SESSION_STATUSES.has(session.status)) {
      throw new ConflictException(
        `Breakout rooms cannot be changed while session is ${session.status}`,
      );
    }
    return session;
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
