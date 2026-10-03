import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BreakoutRoomStatus, Prisma, SessionStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { HOST_ROLES, hasAnyRole, type Principal } from '../common/auth/principal';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { PresenceService } from '../infrastructure/presence.service';
import { RealtimeEventsService } from '../infrastructure/realtime-events.service';
import { OutboxService } from '../outbox/outbox.service';
import { AssignBreakoutParticipantDto } from './dto/assign-breakout-participant.dto';
import { BroadcastBreakoutMessageDto } from './dto/broadcast-breakout-message.dto';
import { CreateBreakoutRoomsDto } from './dto/create-breakout-rooms.dto';
import { RandomizeBreakoutAssignmentsDto } from './dto/randomize-breakout-assignments.dto';

@Injectable()
export class BreakoutsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly presence: PresenceService,
    private readonly realtime: RealtimeEventsService,
  ) {}

  async state(principal: Principal, sessionId: string) {
    return this.database.run(principal, async (transaction) => {
      const session = await transaction.session.findUnique({
        where: { id: sessionId },
        select: { id: true, status: true },
      });
      if (!session) throw new NotFoundException('Session not found');

      const canManage = hasAnyRole(principal, HOST_ROLES);
      const rooms = await transaction.breakoutRoom.findMany({
        where: { sessionId },
        orderBy: { position: 'asc' },
        include: canManage
          ? {
              assignments: {
                orderBy: { assignedAt: 'asc' },
                include: {
                  user: {
                    select: {
                      id: true,
                      displayName: true,
                      email: true,
                      avatarUrl: true,
                    },
                  },
                },
              },
            }
          : undefined,
      });
      const ownAssignment = await transaction.breakoutAssignment.findUnique({
        where: {
          sessionId_userId: {
            sessionId,
            userId: principal.userId,
          },
        },
        include: {
          breakoutRoom: true,
        },
      });

      return {
        sessionId,
        canManage,
        rooms,
        ownAssignment,
      };
    });
  }

  async createRooms(
    principal: Principal,
    sessionId: string,
    input: CreateBreakoutRoomsDto,
  ) {
    this.assertHost(principal);
    const names = input.rooms.map((room) => room.name.trim());
    if (new Set(names.map((name) => name.toLowerCase())).size !== names.length) {
      throw new BadRequestException('Breakout room names must be unique');
    }

    return this.database.run(principal, async (transaction) => {
      const session = await transaction.session.findUnique({
        where: { id: sessionId },
        select: { id: true, status: true },
      });
      if (!session) throw new NotFoundException('Session not found');
      if (![SessionStatus.DRAFT, SessionStatus.SCHEDULED, SessionStatus.LIVE].includes(session.status)) {
        throw new ConflictException(
          `Breakout rooms cannot be configured while session is ${session.status}`,
        );
      }

      const activeCount = await transaction.breakoutRoom.count({
        where: { sessionId, status: BreakoutRoomStatus.ACTIVE },
      });
      if (activeCount > 0) {
        throw new ConflictException('Close active breakout rooms before replacing them');
      }

      await transaction.breakoutAssignment.deleteMany({ where: { sessionId } });
      await transaction.breakoutRoom.deleteMany({ where: { sessionId } });

      const rooms = [];
      for (let index = 0; index < names.length; index += 1) {
        rooms.push(
          await transaction.breakoutRoom.create({
            data: {
              organizationId: principal.organizationId,
              workspaceId: principal.workspaceId,
              sessionId,
              name: names[index],
              position: index,
              livekitRoomName: `session-${sessionId}-breakout-${index + 1}`,
            },
          }),
        );
      }

      await this.audit.record(transaction, principal, {
        action: 'breakout.rooms.created',
        resourceType: 'session',
        resourceId: sessionId,
        metadata: { roomCount: rooms.length },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'session',
        aggregateId: sessionId,
        eventType: 'breakout.rooms.created',
        payload: { sessionId, rooms: rooms.map((room) => ({ id: room.id, name: room.name })) },
      });

      this.publish(sessionId, 'breakout.updated', {
        sessionId,
        reason: 'rooms_created',
      });

      return rooms;
    });
  }

  async randomize(
    principal: Principal,
    sessionId: string,
    input: RandomizeBreakoutAssignmentsDto,
  ) {
    this.assertHost(principal);
    const participants = await this.presence.list(sessionId);
    const eligible = input.includeHosts
      ? participants
      : participants.filter(
          (participant) =>
            !participant.roles.some((role) => ['OWNER', 'ADMIN', 'HOST'].includes(role)),
        );

    if (eligible.length === 0) {
      throw new BadRequestException('No eligible active participants are available');
    }

    return this.database.run(principal, async (transaction) => {
      const rooms = await transaction.breakoutRoom.findMany({
        where: { sessionId, status: { not: BreakoutRoomStatus.CLOSED } },
        orderBy: { position: 'asc' },
      });
      if (rooms.length < 2) {
        throw new BadRequestException('Create at least two breakout rooms first');
      }

      await transaction.breakoutAssignment.deleteMany({ where: { sessionId } });

      const assignments = [];
      const shuffled = [...eligible].sort(() => Math.random() - 0.5);
      for (let index = 0; index < shuffled.length; index += 1) {
        const participant = shuffled[index];
        const room = rooms[index % rooms.length];
        assignments.push(
          await transaction.breakoutAssignment.create({
            data: {
              organizationId: principal.organizationId,
              workspaceId: principal.workspaceId,
              sessionId,
              breakoutRoomId: room.id,
              userId: participant.userId,
            },
            include: {
              user: {
                select: {
                  id: true,
                  displayName: true,
                  email: true,
                  avatarUrl: true,
                },
              },
              breakoutRoom: true,
            },
          }),
        );
      }

      await this.audit.record(transaction, principal, {
        action: 'breakout.assignments.randomized',
        resourceType: 'session',
        resourceId: sessionId,
        metadata: { participantCount: assignments.length, roomCount: rooms.length },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'session',
        aggregateId: sessionId,
        eventType: 'breakout.assignments.updated',
        payload: {
          sessionId,
          assignments: assignments.map((assignment) => ({
            userId: assignment.userId,
            breakoutRoomId: assignment.breakoutRoomId,
          })),
        },
      });

      for (const assignment of assignments) {
        this.realtime.publishSessionEvent({
          sessionId,
          eventName: 'breakout.assignment.updated',
          audienceUserIds: [assignment.userId],
          payload: {
            sessionId,
            breakoutRoomId: assignment.breakoutRoomId,
            roomName: assignment.breakoutRoom.name,
          },
        });
      }
      this.publish(sessionId, 'breakout.updated', {
        sessionId,
        reason: 'assignments_randomized',
      });

      return assignments;
    });
  }

  async assign(
    principal: Principal,
    sessionId: string,
    input: AssignBreakoutParticipantDto,
  ) {
    this.assertHost(principal);
    return this.database.run(principal, async (transaction) => {
      const [room, membership] = await Promise.all([
        transaction.breakoutRoom.findFirst({
          where: {
            id: input.breakoutRoomId,
            sessionId,
            status: { not: BreakoutRoomStatus.CLOSED },
          },
        }),
        transaction.workspaceMembership.findUnique({
          where: {
            workspaceId_userId: {
              workspaceId: principal.workspaceId,
              userId: input.userId,
            },
          },
          select: { id: true },
        }),
      ]);
      if (!room) throw new NotFoundException('Breakout room not found');
      if (!membership) {
        throw new BadRequestException('Participant must belong to the current workspace');
      }

      const assignment = await transaction.breakoutAssignment.upsert({
        where: {
          sessionId_userId: {
            sessionId,
            userId: input.userId,
          },
        },
        update: {
          breakoutRoomId: room.id,
          assignedAt: new Date(),
          joinedAt: null,
          leftAt: null,
        },
        create: {
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          sessionId,
          breakoutRoomId: room.id,
          userId: input.userId,
        },
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              email: true,
              avatarUrl: true,
            },
          },
          breakoutRoom: true,
        },
      });

      await this.audit.record(transaction, principal, {
        action: 'breakout.assignment.updated',
        resourceType: 'breakout_assignment',
        resourceId: assignment.id,
        metadata: {
          sessionId,
          userId: input.userId,
          breakoutRoomId: room.id,
        },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'breakout_assignment',
        aggregateId: assignment.id,
        eventType: 'breakout.assignment.updated',
        payload: {
          sessionId,
          userId: input.userId,
          breakoutRoomId: room.id,
          roomName: room.name,
        },
      });

      this.realtime.publishSessionEvent({
        sessionId,
        eventName: 'breakout.assignment.updated',
        audienceUserIds: [input.userId],
        payload: {
          sessionId,
          breakoutRoomId: room.id,
          roomName: room.name,
        },
      });
      this.publish(sessionId, 'breakout.updated', {
        sessionId,
        reason: 'assignment_updated',
      });

      return assignment;
    });
  }

  async open(principal: Principal, sessionId: string) {
    this.assertHost(principal);
    const openedAt = await this.database.run(principal, async (transaction) => {
      const assignmentCount = await transaction.breakoutAssignment.count({
        where: { sessionId },
      });
      if (assignmentCount === 0) {
        throw new BadRequestException('Assign participants before opening breakouts');
      }
      const now = new Date();
      const result = await transaction.breakoutRoom.updateMany({
        where: { sessionId, status: BreakoutRoomStatus.DRAFT },
        data: {
          status: BreakoutRoomStatus.ACTIVE,
          openedAt: now,
          closedAt: null,
        },
      });
      if (result.count === 0) {
        throw new ConflictException('No draft breakout rooms are available to open');
      }

      await this.audit.record(transaction, principal, {
        action: 'breakout.opened',
        resourceType: 'session',
        resourceId: sessionId,
        metadata: { roomCount: result.count },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'session',
        aggregateId: sessionId,
        eventType: 'breakout.opened',
        payload: { sessionId, openedAt: now.toISOString(), roomCount: result.count },
      });

      this.publish(sessionId, 'breakout.opened', {
        sessionId,
        openedAt: now.toISOString(),
      });
      return now;
    });

    const state = await this.state(principal, sessionId);
    return {
      ...state,
      openedAt: openedAt.toISOString(),
    };
  }

  async close(principal: Principal, sessionId: string) {
    this.assertHost(principal);
    return this.database.run(principal, async (transaction) => {
      const now = new Date();
      const result = await transaction.breakoutRoom.updateMany({
        where: { sessionId, status: BreakoutRoomStatus.ACTIVE },
        data: {
          status: BreakoutRoomStatus.CLOSED,
          closedAt: now,
        },
      });
      await transaction.breakoutAssignment.updateMany({
        where: { sessionId, joinedAt: { not: null }, leftAt: null },
        data: { leftAt: now },
      });
      if (result.count === 0) {
        throw new ConflictException('No active breakout rooms are open');
      }

      await this.audit.record(transaction, principal, {
        action: 'breakout.closed',
        resourceType: 'session',
        resourceId: sessionId,
        metadata: { roomCount: result.count },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'session',
        aggregateId: sessionId,
        eventType: 'breakout.closed',
        payload: { sessionId, closedAt: now.toISOString(), roomCount: result.count },
      });

      this.publish(sessionId, 'breakout.closed', {
        sessionId,
        closedAt: now.toISOString(),
      });

      return { sessionId, closedAt: now.toISOString(), roomCount: result.count };
    });
  }

  async broadcast(
    principal: Principal,
    sessionId: string,
    input: BroadcastBreakoutMessageDto,
  ) {
    this.assertHost(principal);
    const message = input.message.trim();
    const payload = {
      sessionId,
      message,
      sentByUserId: principal.userId,
      sentByDisplayName: principal.displayName,
      sentAt: new Date().toISOString(),
    };

    await this.database.run(principal, async (transaction) => {
      const active = await transaction.breakoutRoom.count({
        where: { sessionId, status: BreakoutRoomStatus.ACTIVE },
      });
      if (active === 0) {
        throw new ConflictException('No active breakout rooms are open');
      }
      await this.audit.record(transaction, principal, {
        action: 'breakout.broadcast.sent',
        resourceType: 'session',
        resourceId: sessionId,
        metadata: { messageLength: message.length },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'session',
        aggregateId: sessionId,
        eventType: 'breakout.broadcast.sent',
        payload,
      });
    });

    this.publish(sessionId, 'breakout.broadcast', payload);
    return payload;
  }

  async joinTarget(
    principal: Principal,
    sessionId: string,
    breakoutRoomId: string,
  ) {
    return this.database.run(principal, async (transaction) => {
      const room = await transaction.breakoutRoom.findFirst({
        where: {
          id: breakoutRoomId,
          sessionId,
          status: BreakoutRoomStatus.ACTIVE,
        },
      });
      if (!room) throw new NotFoundException('Active breakout room not found');

      const isHost = hasAnyRole(principal, HOST_ROLES);
      if (!isHost) {
        const assignment = await transaction.breakoutAssignment.findUnique({
          where: {
            sessionId_userId: {
              sessionId,
              userId: principal.userId,
            },
          },
        });
        if (!assignment || assignment.breakoutRoomId !== breakoutRoomId) {
          throw new ForbiddenException('You are not assigned to this breakout room');
        }
      }

      await transaction.breakoutAssignment.updateMany({
        where: {
          sessionId,
          userId: principal.userId,
          breakoutRoomId,
        },
        data: {
          joinedAt: new Date(),
          leftAt: null,
        },
      });

      return room;
    });
  }

  private assertHost(principal: Principal): void {
    if (!hasAnyRole(principal, HOST_ROLES)) {
      throw new ForbiddenException('A host role is required');
    }
  }

  private publish(
    sessionId: string,
    eventName: string,
    payload: Prisma.JsonObject,
  ): void {
    this.realtime.publishSessionEvent({
      sessionId,
      eventName,
      payload,
    });
  }
}
