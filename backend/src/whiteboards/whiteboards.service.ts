import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SessionStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { Principal } from '../common/auth/principal';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { ENGAGEMENT_EVENT, EngagementService } from '../engagement/engagement.service';
import {
  RealtimeEventsService,
  type SessionRealtimeEvent,
} from '../infrastructure/realtime-events.service';
import { OutboxService } from '../outbox/outbox.service';
import { ApplyWhiteboardOperationDto } from './dto/apply-whiteboard-operation.dto';
import {
  applyWhiteboardOperation,
  parseOperation,
  parseSnapshot,
  type WhiteboardSnapshot,
} from './whiteboard-reducer';

const COMPACTION_THRESHOLD = 50;
const MUTABLE_SESSION_STATUSES = new Set<SessionStatus>([
  SessionStatus.DRAFT,
  SessionStatus.SCHEDULED,
  SessionStatus.LIVE,
]);

@Injectable()
export class WhiteboardsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly engagement: EngagementService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly realtime: RealtimeEventsService,
  ) {}

  async getState(principal: Principal, sessionId: string) {
    return this.database.run(principal, async (transaction) => {
      const session = await transaction.session.findUnique({
        where: { id: sessionId },
        select: { id: true },
      });
      if (!session) throw new NotFoundException('Session not found');

      const whiteboard = await this.ensureDocument(
        transaction,
        principal,
        sessionId,
      );
      const operations = await transaction.whiteboardOperation.findMany({
        where: {
          whiteboardId: whiteboard.id,
          sequence: { gt: whiteboard.compactedThrough },
        },
        orderBy: { sequence: 'asc' },
      });

      const snapshot = this.reduce(
        parseSnapshot(whiteboard.snapshot),
        operations.map((operation) => ({
          type: operation.type,
          payload: operation.payload,
        })),
      );

      return {
        sessionId,
        whiteboardId: whiteboard.id,
        snapshotVersion: whiteboard.snapshotVersion,
        compactedThrough: whiteboard.compactedThrough,
        latestSequence:
          operations.at(-1)?.sequence ?? whiteboard.compactedThrough,
        snapshot,
      };
    });
  }

  async applyOperation(
    principal: Principal,
    sessionId: string,
    input: ApplyWhiteboardOperationDto,
  ) {
    let parsedOperation;
    try {
      parsedOperation = parseOperation(input.type, input.payload);
    } catch {
      throw new BadRequestException('Invalid whiteboard operation payload');
    }

    const result = await this.database.run(
      principal,
      async (transaction) => {
        const session = await transaction.session.findUnique({
          where: { id: sessionId },
          select: { id: true, status: true },
        });
        if (!session) throw new NotFoundException('Session not found');
        if (!MUTABLE_SESSION_STATUSES.has(session.status)) {
          throw new ConflictException(
            `Whiteboard editing is unavailable while session is ${session.status}`,
          );
        }

        const lockKey = `whiteboard:${principal.workspaceId}:${sessionId}`;
        await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;

        const whiteboard = await this.ensureDocument(
          transaction,
          principal,
          sessionId,
        );

        const existing = await transaction.whiteboardOperation.findUnique({
          where: { operationId: input.operationId },
        });
        if (existing) {
          if (
            existing.sessionId !== sessionId ||
            existing.userId !== principal.userId
          ) {
            throw new ConflictException(
              'This whiteboard operation id was already used',
            );
          }
          return {
            whiteboard,
            operation: existing,
            compacted: false,
            duplicate: true,
          };
        }

        const lastOperation = await transaction.whiteboardOperation.findFirst({
          where: { whiteboardId: whiteboard.id },
          orderBy: { sequence: 'desc' },
          select: { sequence: true },
        });
        const sequence = Math.max(
          whiteboard.compactedThrough,
          lastOperation?.sequence ?? 0,
        ) + 1;

        const operation = await transaction.whiteboardOperation.create({
          data: {
            organizationId: principal.organizationId,
            workspaceId: principal.workspaceId,
            sessionId,
            whiteboardId: whiteboard.id,
            userId: principal.userId,
            operationId: input.operationId,
            sequence,
            type: input.type,
            payload: this.toJson(parsedOperation.payload),
          },
        });

        const pendingCount = sequence - whiteboard.compactedThrough;
        const compacted =
          pendingCount >= COMPACTION_THRESHOLD
            ? await this.compact(transaction, whiteboard.id)
            : false;

        await this.engagement.record(transaction, principal, {
          sessionId,
          eventType: ENGAGEMENT_EVENT.WHITEBOARD_CHANGED,
          sourceType: 'whiteboard_operation',
          sourceId: operation.id,
          properties: {
            operationType: input.type,
            sequence,
            compacted,
          },
        });
        await this.audit.record(transaction, principal, {
          action: 'whiteboard.operation.applied',
          resourceType: 'whiteboard',
          resourceId: whiteboard.id,
          metadata: {
            sessionId,
            operationId: input.operationId,
            operationType: input.type,
            sequence,
            compacted,
          },
        });
        await this.outbox.enqueue(transaction, principal, {
          aggregateType: 'whiteboard',
          aggregateId: whiteboard.id,
          eventType: 'whiteboard.updated',
          payload: {
            sessionId,
            whiteboardId: whiteboard.id,
            operationId: input.operationId,
            operationType: input.type,
            sequence,
            compacted,
          },
        });

        return {
          whiteboard,
          operation,
          compacted,
          duplicate: false,
        };
      },
    );

    this.publish(sessionId, 'whiteboard.updated', {
      sessionId,
      whiteboardId: result.whiteboard.id,
      operationId: result.operation.operationId,
      operationType: result.operation.type,
      sequence: result.operation.sequence,
      compacted: result.compacted,
      duplicate: result.duplicate,
      actorUserId: principal.userId,
    });

    return {
      sessionId,
      whiteboardId: result.whiteboard.id,
      operationId: result.operation.operationId,
      sequence: result.operation.sequence,
      compacted: result.compacted,
      duplicate: result.duplicate,
    };
  }

  private async ensureDocument(
    transaction: Prisma.TransactionClient,
    principal: Principal,
    sessionId: string,
  ) {
    return transaction.whiteboardDocument.upsert({
      where: { sessionId },
      update: {},
      create: {
        organizationId: principal.organizationId,
        workspaceId: principal.workspaceId,
        sessionId,
        snapshot: { elements: [] },
      },
    });
  }

  private async compact(
    transaction: Prisma.TransactionClient,
    whiteboardId: string,
  ): Promise<boolean> {
    const whiteboard = await transaction.whiteboardDocument.findUnique({
      where: { id: whiteboardId },
    });
    if (!whiteboard) return false;

    const operations = await transaction.whiteboardOperation.findMany({
      where: {
        whiteboardId,
        sequence: { gt: whiteboard.compactedThrough },
      },
      orderBy: { sequence: 'asc' },
    });
    if (operations.length === 0) return false;

    const snapshot = this.reduce(
      parseSnapshot(whiteboard.snapshot),
      operations.map((operation) => ({
        type: operation.type,
        payload: operation.payload,
      })),
    );
    const compactedThrough =
      operations.at(-1)?.sequence ?? whiteboard.compactedThrough;

    await transaction.whiteboardDocument.update({
      where: { id: whiteboardId },
      data: {
        snapshot: this.toJson(snapshot),
        snapshotVersion: { increment: 1 },
        compactedThrough,
      },
    });
    await transaction.whiteboardOperation.deleteMany({
      where: {
        whiteboardId,
        sequence: { lte: compactedThrough },
      },
    });
    return true;
  }

  private reduce(
    initial: WhiteboardSnapshot,
    operations: Array<{ type: string; payload: unknown }>,
  ): WhiteboardSnapshot {
    let snapshot = initial;
    for (const operation of operations) {
      if (
        operation.type !== 'UPSERT_ELEMENT' &&
        operation.type !== 'DELETE_ELEMENT' &&
        operation.type !== 'CLEAR'
      ) {
        continue;
      }
      try {
        snapshot = applyWhiteboardOperation(
          snapshot,
          parseOperation(operation.type, operation.payload),
        );
      } catch {
        continue;
      }
    }
    return snapshot;
  }

  private publish(
    sessionId: string,
    eventName: SessionRealtimeEvent['eventName'],
    payload: Prisma.JsonObject,
  ): void {
    this.realtime.publishSessionEvent({
      sessionId,
      eventName,
      payload,
    });
  }

  private toJson(value: unknown): Prisma.JsonObject {
    return JSON.parse(JSON.stringify(value)) as Prisma.JsonObject;
  }
}
