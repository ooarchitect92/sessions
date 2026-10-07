import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BreakoutStatus, Prisma, SessionStatus } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import {
  HOST_ROLES,
  hasAnyRole,
  type Principal,
} from '../common/auth/principal';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { RealtimeEventsService } from '../infrastructure/realtime-events.service';
import { OutboxService } from '../outbox/outbox.service';
import { AssignBreakoutDto } from './dto/assign-breakout.dto';
import { BroadcastBreakoutDto } from './dto/broadcast-breakout.dto';
import { CreateBreakoutRoomDto } from './dto/create-breakout-room.dto';
import { RandomizeBreakoutsDto } from './dto/randomize-breakouts.dto';

const PREPARABLE_SESSION_STATUSES: SessionStatus[] = [
  SessionStatus.DRAFT,
  SessionStatus.SCHEDULED,
  SessionStatus.LIVE,
];

@Injectable()
export class BreakoutsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly realtime: RealtimeEventsService,
  ) {}

  async getState(principal: Principal, sessionId: string) {
    return this.database.run(principal, async (transaction) => {
      await this.assertSessionExists(transaction, sessionId);
      const host = hasAnyRole(principal, HOST_ROLES);
      const rooms = await transaction.breakoutRoom.findMany({
        where: { sessionId },
        include: {
          assignments: {
            include: {
              user: {
                select: {
                  id: true,
                  displayName: true,
                  avatarUrl: true,
                },
              },
            },
            orderBy: { assignedAt: 'asc' },
          },
        },
        orderBy: { position: 'asc' },
      });
      const currentAssignment =
        (await transaction.breakoutAssignment.findUnique({
          where: {
            sessionId_userId: {
              sessionId,
              userId: principal.userId,
            },
          },
          include: { breakoutRoom: true },
        })) ?? null;
      const announcements = await transaction.breakoutAnnouncement.findMany({
        where: { sessionId },
        include: {
          author: { select: { displayName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      return {
        sessionId,
        rooms: rooms.map((room) => ({
          id: room.id,
          name: room.name,
          position: room.position,
          status: room.status,
          participantCount: room.assignments.length,
          assignments: host
            ? room.assignments.map((assignment) => ({
                id: assignment.id,
                userId: assignment.userId,
                assignedAt: assignment.assignedAt,
                user: assignment.user,
              }))
            : [],
        })),
        currentAssignment: currentAssignment
          ? {
              id: currentAssignment.id,
              userId: currentAssignment.userId,
              breakoutRoomId: currentAssignment.breakoutRoomId,
              room: {
                id: currentAssignment.breakoutRoom.id,
                name: currentAssignment.breakoutRoom.name,
                status: currentAssignment.breakoutRoom.status,
              },
            }
          : null,
        announcements: announcements.reverse(),
      };
    });
  }

  async createRoom(
    principal: Principal,
    sessionId: string,
    input: CreateBreakoutRoomDto,
  ) {
    this.assertHost(principal);
    const room = await this.database.run(principal, async (transaction) => {
      await this.assertSessionPreparable(transaction, sessionId);
      const aggregate = await transaction.breakoutRoom.aggregate({
        where: { sessionId },
        _max: { position: true },
      });
      const id = randomUUID();
      const created = await transaction.breakoutRoom.create({
        data: {
          id,
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          sessionId,
          name: input.name.trim(),
          position: (aggregate._max.position ?? -1) + 1,
          livekitRoomName: `session-${sessionId}-breakout-${id}`,
        },
      });
      await this.audit.record(transaction, principal, {
        action: 'breakout.room.created',
        resourceType: 'breakout_room',
        resourceId: created.id,
        metadata: { sessionId, position: created.position },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'breakout_room',
        aggregateId: created.id,
        eventType: 'breakout.room.created',
        payload: this.toJson(created),
      });
      return created;
    });
    this.publishUpdated(sessionId, 'room.created');
    return room;
  }

  async assign(
    principal: Principal,
    sessionId: string,
    input: AssignBreakoutDto,
  ) {
    this.assertHost(principal);
    const assignment = await this.database.run(
      principal,
      async (transaction) => {
        await this.assertSessionPreparable(transaction, sessionId);
        await this.assertWorkspaceMember(transaction, principal.workspaceId, input.userId);
        await this.assertBreakoutRoom(transaction, sessionId, input.breakoutRoomId);

        const saved = await transaction.breakoutAssignment.upsert({
          where: {
            sessionId_userId: {
              sessionId,
              userId: input.userId,
            },
          },
          update: {
            breakoutRoomId: input.breakoutRoomId,
            assignedAt: new Date(),
          },
          create: {
            organizationId: principal.organizationId,
            workspaceId: principal.workspaceId,
            sessionId,
            breakoutRoomId: input.breakoutRoomId,
            userId: input.userId,
          },
          include: {
            breakoutRoom: true,
            user: { select: { id: true, displayName: true, avatarUrl: true } },
          },
        });
        await this.outbox.enqueue(transaction, principal, {
          aggregateType: 'breakout_assignment',
          aggregateId: saved.id,
          eventType: 'breakout.assignment.updated',
          payload: this.toJson({
            sessionId,
            breakoutRoomId: saved.breakoutRoomId,
            userId: saved.userId,
          }),
        });
        return saved;
      },
    );
    this.publishUpdated(sessionId, 'assignment.updated');
    return assignment;
  }

  async randomize(
    principal: Principal,
    sessionId: string,
    input: RandomizeBreakoutsDto,
  ) {
    this.assertHost(principal);
    const result = await this.database.run(principal, async (transaction) => {
      await this.assertSessionPreparable(transaction, sessionId);
      const userIds = [...new Set(input.userIds)];
      const membershipCount = await transaction.workspaceMembership.count({
        where: {
          workspaceId: principal.workspaceId,
          userId: { in: userIds },
        },
      });
      if (membershipCount !== userIds.length) {
        throw new BadRequestException(
          'Every breakout participant must be a current workspace member',
        );
      }

      const rooms = await transaction.breakoutRoom.findMany({
        where: { sessionId },
        orderBy: { position: 'asc' },
      });
      if (rooms.length === 0) {
        throw new ConflictException('Create at least one breakout room first');
      }

      const orderedUsers = [...userIds].sort((left, right) =>
        this.assignmentKey(sessionId, left).localeCompare(
          this.assignmentKey(sessionId, right),
        ),
      );

      await transaction.breakoutAssignment.deleteMany({
        where: { sessionId, userId: { in: orderedUsers } },
      });
      await transaction.breakoutAssignment.createMany({
        data: orderedUsers.map((userId, index) => ({
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          sessionId,
          breakoutRoomId: rooms[index % rooms.length]!.id,
          userId,
        })),
      });

      await this.audit.record(transaction, principal, {
        action: 'breakout.assignments.randomized',
        resourceType: 'session',
        resourceId: sessionId,
        metadata: {
          participantCount: orderedUsers.length,
          roomCount: rooms.length,
        },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'session',
        aggregateId: sessionId,
        eventType: 'breakout.assignments.randomized',
        payload: {
          sessionId,
          participantCount: orderedUsers.length,
          roomCount: rooms.length,
        },
      });

      return {
        sessionId,
        participantCount: orderedUsers.length,
        roomCount: rooms.length,
      };
    });
    this.publishUpdated(sessionId, 'assignments.randomized');
    return result;
  }

  async open(principal: Principal, sessionId: string) {
    this.assertHost(principal);
    const result = await this.database.run(principal, async (transaction) => {
      const session = await this.assertSessionExists(transaction, sessionId);
      if (session.status !== SessionStatus.LIVE) {
        throw new ConflictException('Breakout rooms can only open during a live session');
      }
      const roomCount = await transaction.breakoutRoom.count({
        where: { sessionId },
      });
      if (roomCount === 0) {
        throw new ConflictException('Create at least one breakout room first');
      }
      await transaction.breakoutRoom.updateMany({
        where: { sessionId },
        data: { status: BreakoutStatus.OPEN },
      });
      await this.audit.record(transaction, principal, {
        action: 'breakout.opened',
        resourceType: 'session',
        resourceId: sessionId,
        metadata: { roomCount },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'session',
        aggregateId: sessionId,
        eventType: 'breakout.opened',
        payload: { sessionId, roomCount },
      });
      return { sessionId, roomCount, status: BreakoutStatus.OPEN };
    });
    this.realtime.publishSessionEvent({
      sessionId,
      eventName: 'breakouts.updated',
      payload: { sessionId, reason: 'opened' },
    });
    return result;
  }

  async close(principal: Principal, sessionId: string) {
    this.assertHost(principal);
    const result = await this.database.run(principal, async (transaction) => {
      await this.assertSessionExists(transaction, sessionId);
      const changed = await transaction.breakoutRoom.updateMany({
        where: { sessionId, status: BreakoutStatus.OPEN },
        data: { status: BreakoutStatus.CLOSED },
      });
      await this.audit.record(transaction, principal, {
        action: 'breakout.closed',
        resourceType: 'session',
        resourceId: sessionId,
        metadata: { roomCount: changed.count },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'session',
        aggregateId: sessionId,
        eventType: 'breakout.closed',
        payload: { sessionId, roomCount: changed.count },
      });
      return {
        sessionId,
        roomCount: changed.count,
        status: BreakoutStatus.CLOSED,
      };
    });
    this.realtime.publishSessionEvent({
      sessionId,
      eventName: 'breakouts.updated',
      payload: { sessionId, reason: 'closed' },
    });
    return result;
  }

  async broadcast(
    principal: Principal,
    sessionId: string,
    input: BroadcastBreakoutDto,
  ) {
    this.assertHost(principal);
    const announcement = await this.database.run(
      principal,
      async (transaction) => {
        await this.assertSessionExists(transaction, sessionId);
        const openRooms = await transaction.breakoutRoom.count({
          where: { sessionId, status: BreakoutStatus.OPEN },
        });
        if (openRooms === 0) {
          throw new ConflictException(
            'Open breakout rooms before broadcasting an announcement',
          );
        }
        const created = await transaction.breakoutAnnouncement.create({
          data: {
            organizationId: principal.organizationId,
            workspaceId: principal.workspaceId,
            sessionId,
            authorUserId: principal.userId,
            body: input.body.trim(),
          },
          include: { author: { select: { displayName: true } } },
        });
        await this.outbox.enqueue(transaction, principal, {
          aggregateType: 'breakout_announcement',
          aggregateId: created.id,
          eventType: 'breakout.announcement.created',
          payload: this.toJson(created),
        });
        return created;
      },
    );
    this.realtime.publishSessionEvent({
      sessionId,
      eventName: 'breakouts.announcement',
      payload: announcement,
    });
    return announcement;
  }

  async resolveMediaRoom(
    principal: Principal,
    sessionId: string,
    breakoutRoomId: string,
  ): Promise<{ id: string; livekitRoomName: string }> {
    return this.database.run(principal, async (transaction) => {
      const room = await transaction.breakoutRoom.findFirst({
        where: {
          id: breakoutRoomId,
          sessionId,
          status: BreakoutStatus.OPEN,
        },
        select: { id: true, livekitRoomName: true },
      });
      if (!room) {
        throw new ConflictException('The selected breakout room is not open');
      }
      if (!hasAnyRole(principal, HOST_ROLES)) {
        const assignment = await transaction.breakoutAssignment.findUnique({
          where: {
            sessionId_userId: {
              sessionId,
              userId: principal.userId,
            },
          },
          select: { breakoutRoomId: true },
        });
        if (assignment?.breakoutRoomId !== breakoutRoomId) {
          throw new ForbiddenException(
            'You are not assigned to this breakout room',
          );
        }
      }
      return room;
    });
  }

  private publishUpdated(sessionId: string, reason: string): void {
    this.realtime.publishSessionEvent({
      sessionId,
      eventName: 'breakouts.updated',
      payload: { sessionId, reason },
    });
  }

  private assignmentKey(sessionId: string, userId: string): string {
    return createHash('sha256')
      .update(`${sessionId}:${userId}`)
      .digest('hex');
  }

  private async assertSessionExists(
    transaction: Prisma.TransactionClient,
    sessionId: string,
  ) {
    const session = await transaction.session.findUnique({
      where: { id: sessionId },
      select: { id: true, status: true },
    });
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  private async assertSessionPreparable(
    transaction: Prisma.TransactionClient,
    sessionId: string,
  ) {
    const session = await this.assertSessionExists(transaction, sessionId);
    if (!PREPARABLE_SESSION_STATUSES.includes(session.status)) {
      throw new ConflictException(
        `Breakout rooms cannot be changed while session is ${session.status}`,
      );
    }
    return session;
  }

  private async assertWorkspaceMember(
    transaction: Prisma.TransactionClient,
    workspaceId: string,
    userId: string,
  ): Promise<void> {
    const membership = await transaction.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { id: true },
    });
    if (!membership) throw new NotFoundException('Workspace member not found');
  }

  private async assertBreakoutRoom(
    transaction: Prisma.TransactionClient,
    sessionId: string,
    breakoutRoomId: string,
  ): Promise<void> {
    const room = await transaction.breakoutRoom.findFirst({
      where: { id: breakoutRoomId, sessionId },
      select: { id: true },
    });
    if (!room) throw new NotFoundException('Breakout room not found');
  }

  private assertHost(principal: Principal): void {
    if (!hasAnyRole(principal, HOST_ROLES)) {
      throw new ForbiddenException('A host role is required');
    }
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
