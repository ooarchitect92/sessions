import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  SessionStatus,
  type CobrowseState,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import {
  HOST_ROLES,
  hasAnyRole,
  type Principal,
} from '../common/auth/principal';
import { EmbedResolverService } from '../content/embed-resolver.service';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { RealtimeEventsService } from '../infrastructure/realtime-events.service';
import { OutboxService } from '../outbox/outbox.service';
import {
  GrantCobrowseControlDto,
  NavigateCobrowseDto,
  StartCobrowseDto,
  StopCobrowseDto,
} from './cobrowse.dto';

const COBROWSE_SESSION_STATUSES = new Set<SessionStatus>([
  SessionStatus.LIVE,
]);

export interface CobrowseStateView {
  id: string | null;
  sessionId: string;
  url: string | null;
  active: boolean;
  controllerUserId: string | null;
  startedById: string | null;
  version: number;
  updatedAt: string | null;
}

@Injectable()
export class CobrowseService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly embeds: EmbedResolverService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly realtime: RealtimeEventsService,
  ) {}

  async getState(
    principal: Principal,
    sessionId: string,
  ): Promise<CobrowseStateView> {
    return this.database.run(principal, async (transaction) => {
      await this.assertSessionExists(transaction, sessionId);
      const state = await transaction.cobrowseState.findUnique({
        where: { sessionId },
      });
      return state ? this.view(state) : this.emptyState(sessionId);
    });
  }

  async start(
    principal: Principal,
    sessionId: string,
    input: StartCobrowseDto,
  ): Promise<CobrowseStateView> {
    this.assertHost(principal);
    const url = this.embeds.resolve(input.url).sourceUrl;

    const state = await this.database.run(principal, async (transaction) => {
      await this.assertSessionLive(transaction, sessionId);
      const existing = await transaction.cobrowseState.findUnique({
        where: { sessionId },
      });

      const next = existing
        ? await transaction.cobrowseState.update({
            where: { id: existing.id },
            data: {
              url,
              active: true,
              controllerUserId: principal.userId,
              startedById: principal.userId,
              version: { increment: 1 },
            },
          })
        : await transaction.cobrowseState.create({
            data: {
              organizationId: principal.organizationId,
              workspaceId: principal.workspaceId,
              sessionId,
              url,
              active: true,
              controllerUserId: principal.userId,
              startedById: principal.userId,
            },
          });

      await this.recordChange(transaction, principal, next, 'cobrowse.started', {
        url,
        controllerUserId: principal.userId,
      });
      return next;
    });

    return this.publish(sessionId, state);
  }

  async navigate(
    principal: Principal,
    sessionId: string,
    input: NavigateCobrowseDto,
  ): Promise<CobrowseStateView> {
    const url = this.embeds.resolve(input.url).sourceUrl;

    const state = await this.database.run(principal, async (transaction) => {
      await this.assertSessionLive(transaction, sessionId);
      const current = await transaction.cobrowseState.findUnique({
        where: { sessionId },
      });
      if (!current?.active) {
        throw new ConflictException('Co-browsing is not active for this session');
      }
      if (
        !hasAnyRole(principal, HOST_ROLES) &&
        current.controllerUserId !== principal.userId
      ) {
        throw new ForbiddenException(
          'The host has not granted you co-browse navigation control',
        );
      }

      const updated = await transaction.cobrowseState.updateMany({
        where: {
          id: current.id,
          version: input.version,
          active: true,
        },
        data: {
          url,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        throw new ConflictException(
          'Co-browse state changed. Refresh and retry navigation.',
        );
      }

      const next = await transaction.cobrowseState.findUniqueOrThrow({
        where: { id: current.id },
      });
      await this.recordChange(
        transaction,
        principal,
        next,
        'cobrowse.navigated',
        { url },
      );
      return next;
    });

    return this.publish(sessionId, state);
  }

  async grantControl(
    principal: Principal,
    sessionId: string,
    input: GrantCobrowseControlDto,
  ): Promise<CobrowseStateView> {
    this.assertHost(principal);

    const state = await this.database.run(principal, async (transaction) => {
      await this.assertSessionLive(transaction, sessionId);
      const membership = await transaction.workspaceMembership.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: principal.workspaceId,
            userId: input.controllerUserId,
          },
        },
        select: { userId: true },
      });
      if (!membership) {
        throw new NotFoundException(
          'The selected controller is not a member of this workspace',
        );
      }

      const current = await transaction.cobrowseState.findUnique({
        where: { sessionId },
      });
      if (!current?.active) {
        throw new ConflictException('Co-browsing is not active for this session');
      }

      const updated = await transaction.cobrowseState.updateMany({
        where: {
          id: current.id,
          version: input.version,
          active: true,
        },
        data: {
          controllerUserId: input.controllerUserId,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        throw new ConflictException(
          'Co-browse state changed. Refresh before granting control.',
        );
      }

      const next = await transaction.cobrowseState.findUniqueOrThrow({
        where: { id: current.id },
      });
      await this.recordChange(
        transaction,
        principal,
        next,
        'cobrowse.control_granted',
        { controllerUserId: input.controllerUserId },
      );
      return next;
    });

    return this.publish(sessionId, state);
  }

  async stop(
    principal: Principal,
    sessionId: string,
    input: StopCobrowseDto,
  ): Promise<CobrowseStateView> {
    this.assertHost(principal);

    const state = await this.database.run(principal, async (transaction) => {
      await this.assertSessionExists(transaction, sessionId);
      const current = await transaction.cobrowseState.findUnique({
        where: { sessionId },
      });
      if (!current) return null;
      if (!current.active) return current;

      const updated = await transaction.cobrowseState.updateMany({
        where: {
          id: current.id,
          version: input.version,
          active: true,
        },
        data: {
          active: false,
          controllerUserId: null,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        throw new ConflictException(
          'Co-browse state changed. Refresh before stopping.',
        );
      }

      const next = await transaction.cobrowseState.findUniqueOrThrow({
        where: { id: current.id },
      });
      await this.recordChange(
        transaction,
        principal,
        next,
        'cobrowse.stopped',
        {},
      );
      return next;
    });

    if (!state) return this.emptyState(sessionId);
    return this.publish(sessionId, state);
  }

  private async recordChange(
    transaction: Prisma.TransactionClient,
    principal: Principal,
    state: CobrowseState,
    action: string,
    metadata: Prisma.InputJsonObject,
  ): Promise<void> {
    await this.audit.record(transaction, principal, {
      action,
      resourceType: 'cobrowse_state',
      resourceId: state.id,
      metadata: {
        sessionId: state.sessionId,
        version: state.version,
        ...metadata,
      },
    });
    await this.outbox.enqueue(transaction, principal, {
      aggregateType: 'session',
      aggregateId: state.sessionId,
      eventType: action,
      payload: this.toJson(this.view(state)),
    });
  }

  private publish(
    sessionId: string,
    state: CobrowseState,
  ): CobrowseStateView {
    const view = this.view(state);
    this.realtime.publishSessionEvent({
      sessionId,
      eventName: 'cobrowse.updated',
      payload: view,
    });
    return view;
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

  private async assertSessionLive(
    transaction: Prisma.TransactionClient,
    sessionId: string,
  ): Promise<void> {
    const session = await this.assertSessionExists(transaction, sessionId);
    if (!COBROWSE_SESSION_STATUSES.has(session.status)) {
      throw new ConflictException(
        'Co-browsing can only be controlled while the session is live',
      );
    }
  }

  private assertHost(principal: Principal): void {
    if (!hasAnyRole(principal, HOST_ROLES)) {
      throw new ForbiddenException(
        'A host role is required to manage co-browsing',
      );
    }
  }

  private view(state: CobrowseState): CobrowseStateView {
    return {
      id: state.id,
      sessionId: state.sessionId,
      url: state.url,
      active: state.active,
      controllerUserId: state.controllerUserId,
      startedById: state.startedById,
      version: state.version,
      updatedAt: state.updatedAt.toISOString(),
    };
  }

  private emptyState(sessionId: string): CobrowseStateView {
    return {
      id: null,
      sessionId,
      url: null,
      active: false,
      controllerUserId: null,
      startedById: null,
      version: 0,
      updatedAt: null,
    };
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
