import {
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
import { RealtimeEventsService } from '../infrastructure/realtime-events.service';
import { OutboxService } from '../outbox/outbox.service';
import { AppendWhiteboardOperationDto } from './dto/append-whiteboard-operation.dto';
import { SaveWhiteboardSnapshotDto } from './dto/save-whiteboard-snapshot.dto';

const EDITABLE_SESSION_STATUSES = new Set<SessionStatus>([
  SessionStatus.DRAFT,
  SessionStatus.SCHEDULED,
  SessionStatus.LIVE,
]);

@Injectable()
export class WhiteboardService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly realtime: RealtimeEventsService,
  ) {}

  async get(principal: Principal, sessionId: string) {
    return this.database.run(principal, async (transaction) => {
      await this.assertSessionExists(transaction, sessionId);
      const document = await this.ensureDocument(transaction, principal, sessionId);
      const operations = await transaction.whiteboardOperation.findMany({
        where: {
          documentId: document.id,
          sequence: { gt: document.snapshotVersion },
        },
        include: {
          author: {
            select: { id: true, displayName: true, avatarUrl: true },
          },
        },
        orderBy: { sequence: 'asc' },
      });

      return {
        document: {
          id: document.id,
          sessionId: document.sessionId,
          version: document.version,
          snapshotVersion: document.snapshotVersion,
          snapshot: document.snapshot,
          updatedAt: document.updatedAt,
        },
        operations,
      };
    });
  }

  async appendOperation(
    principal: Principal,
    sessionId: string,
    input: AppendWhiteboardOperationDto,
  ) {
    const operation = await this.database.run(principal, async (transaction) => {
      await this.assertSessionEditable(transaction, sessionId);
      const document = await this.ensureDocument(transaction, principal, sessionId);

      const existing = await transaction.whiteboardOperation.findFirst({
        where: { documentId: document.id, operationId: input.operationId },
        include: {
          author: {
            select: { id: true, displayName: true, avatarUrl: true },
          },
        },
      });
      if (existing) return existing;

      const updated = await transaction.whiteboardDocument.update({
        where: { id: document.id },
        data: { version: { increment: 1 } },
        select: { version: true },
      });

      const created = await transaction.whiteboardOperation.create({
        data: {
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          sessionId,
          documentId: document.id,
          operationId: input.operationId,
          authorUserId: principal.userId,
          sequence: updated.version,
          kind: input.kind,
          payload: input.payload as Prisma.InputJsonValue,
        },
        include: {
          author: {
            select: { id: true, displayName: true, avatarUrl: true },
          },
        },
      });

      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'whiteboard',
        aggregateId: document.id,
        eventType: 'whiteboard.operation.appended',
        payload: {
          sessionId,
          whiteboardId: document.id,
          operationId: created.operationId,
          sequence: created.sequence,
          kind: created.kind,
        },
      });

      return created;
    });

    this.realtime.publishSessionEvent({
      sessionId,
      eventName: 'whiteboard.operation',
      payload: operation,
    });
    return operation;
  }

  async saveSnapshot(
    principal: Principal,
    sessionId: string,
    input: SaveWhiteboardSnapshotDto,
  ) {
    this.assertHost(principal);
    const result = await this.database.run(principal, async (transaction) => {
      await this.assertSessionExists(transaction, sessionId);
      const document = await this.ensureDocument(transaction, principal, sessionId);

      if (input.baseVersion !== document.version) {
        throw new ConflictException(
          `Whiteboard version changed from ${input.baseVersion} to ${document.version}`,
        );
      }

      const updated = await transaction.whiteboardDocument.update({
        where: { id: document.id },
        data: {
          snapshot: input.snapshot as Prisma.InputJsonValue,
          snapshotVersion: document.version,
        },
      });

      await transaction.whiteboardOperation.deleteMany({
        where: {
          documentId: document.id,
          sequence: { lte: document.version },
        },
      });

      await this.audit.record(transaction, principal, {
        action: 'whiteboard.snapshot.saved',
        resourceType: 'whiteboard',
        resourceId: document.id,
        metadata: { sessionId, version: document.version },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'whiteboard',
        aggregateId: document.id,
        eventType: 'whiteboard.snapshot.saved',
        payload: { sessionId, version: document.version },
      });

      return {
        id: updated.id,
        sessionId,
        version: updated.version,
        snapshotVersion: updated.snapshotVersion,
        snapshot: updated.snapshot,
        updatedAt: updated.updatedAt,
      };
    });

    this.realtime.publishSessionEvent({
      sessionId,
      eventName: 'whiteboard.snapshot.updated',
      payload: result,
    });
    return result;
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
        snapshot: { objects: [] },
      },
    });
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
    if (!EDITABLE_SESSION_STATUSES.has(session.status)) {
      throw new ConflictException(
        `Whiteboard is read-only while session is ${session.status}`,
      );
    }
    return session;
  }

  private assertHost(principal: Principal): void {
    if (!hasAnyRole(principal, HOST_ROLES)) {
      throw new ForbiddenException('A host role is required');
    }
  }
}
