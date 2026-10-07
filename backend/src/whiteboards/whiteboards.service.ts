import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SessionStatus } from '@prisma/client';
import type { Principal } from '../common/auth/principal';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { RealtimeEventsService } from '../infrastructure/realtime-events.service';
import { OutboxService } from '../outbox/outbox.service';
import {
  type AppendWhiteboardOperationDto,
  type WhiteboardOperationKind,
} from './dto/append-whiteboard-operation.dto';

const EDITABLE_SESSION_STATUSES: SessionStatus[] = [
  SessionStatus.DRAFT,
  SessionStatus.SCHEDULED,
  SessionStatus.LIVE,
];

const COMPACTION_THRESHOLD = 100;
const MAX_OPERATION_BYTES = 64 * 1024;
const RECENT_OPERATION_ID_LIMIT = 250;

type WhiteboardObject = Record<string, unknown> & {
  id: string;
  type: 'stroke' | 'shape' | 'note' | 'text';
};

interface WhiteboardSnapshot {
  objects: Record<string, WhiteboardObject>;
  recentOperationIds: string[];
}

@Injectable()
export class WhiteboardsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly outbox: OutboxService,
    private readonly realtime: RealtimeEventsService,
  ) {}

  async getBoard(principal: Principal, sessionId: string) {
    return this.database.run(principal, async (transaction) => {
      await this.assertSessionExists(transaction, sessionId);
      const board = await transaction.whiteboard.findUnique({
        where: { sessionId },
      });

      if (!board) {
        return {
          sessionId,
          boardId: null,
          version: 0,
          snapshotSequence: 0,
          snapshot: this.emptySnapshot(),
          operations: [],
        };
      }

      const operations = await transaction.whiteboardOperation.findMany({
        where: {
          whiteboardId: board.id,
          sequence: { gt: board.snapshotSequence },
        },
        orderBy: { sequence: 'asc' },
        take: COMPACTION_THRESHOLD,
      });

      return {
        sessionId,
        boardId: board.id,
        version: board.version,
        snapshotSequence: board.snapshotSequence,
        snapshot: this.snapshotFromJson(board.snapshot),
        operations,
      };
    });
  }

  async appendOperation(
    principal: Principal,
    sessionId: string,
    input: AppendWhiteboardOperationDto,
  ) {
    this.validateOperation(input.kind, input.payload);

    const result = await this.database.run(principal, async (transaction) => {
      await this.assertSessionEditable(transaction, sessionId);

      let board = await transaction.whiteboard.findUnique({
        where: { sessionId },
      });
      if (!board) {
        board = await transaction.whiteboard.create({
          data: {
            organizationId: principal.organizationId,
            workspaceId: principal.workspaceId,
            sessionId,
            snapshot: this.toJson(this.emptySnapshot()),
          },
        });
      }

      const existing = await transaction.whiteboardOperation.findUnique({
        where: { clientOperationId: input.clientOperationId },
      });
      if (existing) {
        return {
          operation: existing,
          boardVersion: board.version,
          compacted: false,
          deduplicated: true,
        };
      }

      const currentSnapshot = this.snapshotFromJson(board.snapshot);
      if (currentSnapshot.recentOperationIds.includes(input.clientOperationId)) {
        return {
          operation: null,
          boardVersion: board.version,
          compacted: false,
          deduplicated: true,
        };
      }

      const advanced = await transaction.whiteboard.update({
        where: { id: board.id },
        data: { version: { increment: 1 } },
      });

      const operation = await transaction.whiteboardOperation.create({
        data: {
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          sessionId,
          whiteboardId: board.id,
          actorUserId: principal.userId,
          clientOperationId: input.clientOperationId,
          sequence: advanced.version,
          kind: input.kind,
          payload: this.toJson(input.payload),
        },
      });

      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'whiteboard',
        aggregateId: board.id,
        eventType: 'whiteboard.operation.appended',
        payload: this.toJson({
          sessionId,
          boardId: board.id,
          operation,
        }),
      });

      const shouldCompact =
        advanced.version - board.snapshotSequence >= COMPACTION_THRESHOLD;
      if (shouldCompact) {
        await this.compact(
          transaction,
          board.id,
          advanced.version,
          board.snapshotSequence,
          currentSnapshot,
        );
      }

      return {
        operation,
        boardVersion: advanced.version,
        compacted: shouldCompact,
        deduplicated: false,
      };
    });

    if (result.operation) {
      this.realtime.publishSessionEvent({
        sessionId,
        eventName: 'whiteboard.operation.appended',
        payload: {
          sessionId,
          operation: result.operation,
          boardVersion: result.boardVersion,
          compacted: result.compacted,
        },
      });
    }

    return result;
  }

  private async compact(
    transaction: Prisma.TransactionClient,
    whiteboardId: string,
    throughSequence: number,
    fromSequence: number,
    baseSnapshot: WhiteboardSnapshot,
  ): Promise<void> {
    const operations = await transaction.whiteboardOperation.findMany({
      where: {
        whiteboardId,
        sequence: { gt: fromSequence, lte: throughSequence },
      },
      orderBy: { sequence: 'asc' },
    });

    let snapshot = baseSnapshot;
    for (const operation of operations) {
      snapshot = this.applyOperation(
        snapshot,
        operation.kind as WhiteboardOperationKind,
        this.objectFromJson(operation.payload),
      );
      snapshot = {
        ...snapshot,
        recentOperationIds: [
          ...snapshot.recentOperationIds,
          operation.clientOperationId,
        ].slice(-RECENT_OPERATION_ID_LIMIT),
      };
    }

    await transaction.whiteboard.update({
      where: { id: whiteboardId },
      data: {
        snapshot: this.toJson(snapshot),
        snapshotSequence: throughSequence,
      },
    });

    await transaction.whiteboardOperation.deleteMany({
      where: {
        whiteboardId,
        sequence: { lte: throughSequence },
      },
    });
  }

  private applyOperation(
    snapshot: WhiteboardSnapshot,
    kind: WhiteboardOperationKind,
    payload: Record<string, unknown>,
  ): WhiteboardSnapshot {
    if (kind === 'CLEAR') {
      return { ...snapshot, objects: {} };
    }

    if (kind === 'OBJECT_REMOVE') {
      const objectId = this.requiredString(payload.objectId, 'objectId');
      const objects = { ...snapshot.objects };
      delete objects[objectId];
      return { ...snapshot, objects };
    }

    const object = this.requireWhiteboardObject(payload.object, kind);
    return {
      ...snapshot,
      objects: {
        ...snapshot.objects,
        [object.id]: object,
      },
    };
  }

  private validateOperation(
    kind: WhiteboardOperationKind,
    payload: Record<string, unknown>,
  ): void {
    const bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
    if (bytes > MAX_OPERATION_BYTES) {
      throw new BadRequestException('Whiteboard operation is too large');
    }

    if (kind === 'CLEAR') return;
    if (kind === 'OBJECT_REMOVE') {
      this.requiredString(payload.objectId, 'objectId');
      return;
    }

    this.requireWhiteboardObject(payload.object, kind);
  }

  private requireWhiteboardObject(
    value: unknown,
    kind: WhiteboardOperationKind,
  ): WhiteboardObject {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('Whiteboard operation requires an object');
    }
    const object = value as Record<string, unknown>;
    const id = this.requiredString(object.id, 'object.id');
    if (id.length > 100) {
      throw new BadRequestException('Whiteboard object id is too long');
    }

    const expectedType: Record<string, WhiteboardObject['type']> = {
      STROKE_ADD: 'stroke',
      SHAPE_ADD: 'shape',
      NOTE_ADD: 'note',
      TEXT_ADD: 'text',
    };
    const type = this.requiredString(object.type, 'object.type');
    if (expectedType[kind] !== type) {
      throw new BadRequestException(
        `${kind} requires an object of type ${expectedType[kind]}`,
      );
    }

    return this.objectFromJson(this.toJson({ ...object, id, type })) as WhiteboardObject;
  }

  private requiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`${field} must be a non-empty string`);
    }
    return value.trim();
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

  private async assertSessionEditable(
    transaction: Prisma.TransactionClient,
    sessionId: string,
  ) {
    const session = await this.assertSessionExists(transaction, sessionId);
    if (!EDITABLE_SESSION_STATUSES.includes(session.status)) {
      throw new ConflictException(
        `Whiteboard is unavailable while session is ${session.status}`,
      );
    }
    return session;
  }

  private emptySnapshot(): WhiteboardSnapshot {
    return { objects: {}, recentOperationIds: [] };
  }

  private snapshotFromJson(value: Prisma.JsonValue): WhiteboardSnapshot {
    const object = this.objectFromJson(value);
    const objectsValue = object.objects;
    const recentValue = object.recentOperationIds;

    const objects: Record<string, WhiteboardObject> = {};
    if (
      objectsValue &&
      typeof objectsValue === 'object' &&
      !Array.isArray(objectsValue)
    ) {
      for (const [key, raw] of Object.entries(objectsValue)) {
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
          const candidate = raw as Record<string, unknown>;
          if (
            typeof candidate.id === 'string' &&
            typeof candidate.type === 'string'
          ) {
            objects[key] = candidate as WhiteboardObject;
          }
        }
      }
    }

    return {
      objects,
      recentOperationIds: Array.isArray(recentValue)
        ? recentValue.filter(
            (value): value is string => typeof value === 'string',
          )
        : [],
    };
  }

  private objectFromJson(value: Prisma.JsonValue | Prisma.InputJsonValue) {
    const parsed = JSON.parse(JSON.stringify(value)) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {} as Record<string, unknown>;
    }
    return parsed as Record<string, unknown>;
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
