import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  PlanCode,
  Prisma,
  QuotaReservationStatus,
  WorkspaceSubscriptionStatus,
} from '@prisma/client';
import type { Principal } from '../common/auth/principal';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { WorkerPrismaService } from '../database/worker-prisma.service';
import {
  PLAN_CATALOG,
  planDefinition,
  type PlanDefinition,
} from './billing-plans';

@Injectable()
export class BillingService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly worker: WorkerPrismaService,
  ) {}

  plans(): PlanDefinition[] {
    return Object.values(PLAN_CATALOG);
  }

  async summary(principal: Principal) {
    return this.database.run(principal, async (transaction) => {
      const subscription = await this.reconcileWorkspaceInTransaction(
        transaction,
        principal.organizationId,
        principal.workspaceId,
      );
      const [usageRows, reservationRows] = await Promise.all([
        transaction.usageLedgerEntry.groupBy({
          by: ['metric'],
          where: {
            workspaceId: principal.workspaceId,
            occurredAt: {
              gte: subscription.currentPeriodStart,
              lt: subscription.currentPeriodEnd,
            },
          },
          _sum: { quantity: true },
        }),
        transaction.quotaReservation.groupBy({
          by: ['metric'],
          where: {
            workspaceId: principal.workspaceId,
            status: QuotaReservationStatus.ACTIVE,
            expiresAt: { gt: new Date() },
          },
          _sum: { quantity: true },
        }),
      ]);

      const usage = new Map(
        usageRows.map((row) => [row.metric, row._sum.quantity ?? 0n]),
      );
      const reserved = new Map(
        reservationRows.map((row) => [row.metric, row._sum.quantity ?? 0n]),
      );
      const quotaLimits = this.jsonQuotaLimits(subscription.quotaLimits);
      const metrics = [...new Set([
        ...Object.keys(quotaLimits),
        ...usage.keys(),
        ...reserved.keys(),
      ])].sort();

      return {
        subscription: {
          id: subscription.id,
          planCode: subscription.planCode,
          status: subscription.status,
          seatLimit: subscription.seatLimit,
          seatsUsed: subscription.seatsUsed,
          entitlements: subscription.entitlements,
          currentPeriodStart: subscription.currentPeriodStart,
          currentPeriodEnd: subscription.currentPeriodEnd,
          provider: subscription.provider,
          lastReconciledAt: subscription.lastReconciledAt,
        },
        quotas: metrics.map((metric) => {
          const used = usage.get(metric) ?? 0n;
          const held = reserved.get(metric) ?? 0n;
          const limit = quotaLimits[metric];
          return {
            metric,
            limit,
            used: Number(used),
            reserved: Number(held),
            remaining:
              typeof limit === 'number'
                ? Math.max(0, limit - Number(used) - Number(held))
                : null,
          };
        }),
      };
    });
  }

  async createDefaultSubscription(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    workspaceId: string,
  ) {
    return this.ensureSubscription(transaction, organizationId, workspaceId);
  }

  async assertSeatCapacity(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    workspaceId: string,
    additionalSeats: number,
  ): Promise<void> {
    const lockKey = `billing:seats:${workspaceId}`;
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
    const subscription = await this.ensureSubscription(
      transaction,
      organizationId,
      workspaceId,
    );
    if (subscription.status === WorkspaceSubscriptionStatus.CANCELED) {
      throw new ForbiddenException('The workspace subscription is canceled');
    }

    const now = new Date();
    const [members, pendingInvitations] = await Promise.all([
      transaction.workspaceMembership.count({ where: { workspaceId } }),
      transaction.workspaceInvitation.count({
        where: {
          workspaceId,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
      }),
    ]);
    const occupied = members + pendingInvitations;
    if (occupied + additionalSeats > subscription.seatLimit) {
      throw new ForbiddenException(
        `Workspace seat limit reached (${subscription.seatLimit})`,
      );
    }
  }

  async recordUsage(input: {
    organizationId: string;
    workspaceId: string;
    metric: string;
    quantity: bigint;
    idempotencyKey: string;
    sourceType: string;
    sourceId?: string;
    occurredAt?: Date;
  }) {
    if (input.quantity === 0n) return null;
    return this.worker.usageLedgerEntry.upsert({
      where: {
        workspaceId_idempotencyKey: {
          workspaceId: input.workspaceId,
          idempotencyKey: input.idempotencyKey,
        },
      },
      update: {},
      create: {
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        metric: input.metric,
        quantity: input.quantity,
        idempotencyKey: input.idempotencyKey,
        sourceType: input.sourceType,
        sourceId: input.sourceId ?? null,
        occurredAt: input.occurredAt ?? new Date(),
      },
    });
  }

  async reserveQuota(input: {
    organizationId: string;
    workspaceId: string;
    metric: string;
    quantity: bigint;
    reservationKey: string;
    ttlSeconds?: number;
  }) {
    if (input.quantity <= 0n) {
      throw new ConflictException('Quota reservation quantity must be positive');
    }

    return this.worker.$transaction(async (transaction) => {
      const existing = await transaction.quotaReservation.findUnique({
        where: {
          workspaceId_reservationKey: {
            workspaceId: input.workspaceId,
            reservationKey: input.reservationKey,
          },
        },
      });
      if (existing) return existing;

      const lockKey = `billing:quota:${input.workspaceId}:${input.metric}`;
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
      const subscription = await this.ensureSubscription(
        transaction,
        input.organizationId,
        input.workspaceId,
      );
      await transaction.quotaReservation.updateMany({
        where: {
          workspaceId: input.workspaceId,
          status: QuotaReservationStatus.ACTIVE,
          expiresAt: { lte: new Date() },
        },
        data: { status: QuotaReservationStatus.EXPIRED },
      });

      const limit = this.quotaLimit(subscription.quotaLimits, input.metric);
      if (limit !== null) {
        const [usage, held] = await Promise.all([
          transaction.usageLedgerEntry.aggregate({
            where: {
              workspaceId: input.workspaceId,
              metric: input.metric,
              occurredAt: {
                gte: subscription.currentPeriodStart,
                lt: subscription.currentPeriodEnd,
              },
            },
            _sum: { quantity: true },
          }),
          transaction.quotaReservation.aggregate({
            where: {
              workspaceId: input.workspaceId,
              metric: input.metric,
              status: QuotaReservationStatus.ACTIVE,
              expiresAt: { gt: new Date() },
            },
            _sum: { quantity: true },
          }),
        ]);
        const used = usage._sum.quantity ?? 0n;
        const reserved = held._sum.quantity ?? 0n;
        if (used + reserved + input.quantity > BigInt(limit)) {
          throw new ForbiddenException(
            `Quota exceeded for metric ${input.metric}`,
          );
        }
      }

      return transaction.quotaReservation.create({
        data: {
          organizationId: input.organizationId,
          workspaceId: input.workspaceId,
          metric: input.metric,
          quantity: input.quantity,
          reservationKey: input.reservationKey,
          expiresAt: new Date(
            Date.now() + Math.max(60, input.ttlSeconds ?? 15 * 60) * 1000,
          ),
        },
      });
    });
  }

  async commitReservation(
    reservationId: string,
    sourceType: string,
    sourceId?: string,
  ) {
    return this.worker.$transaction(async (transaction) => {
      const lockKey = `billing:reservation:${reservationId}`;
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
      const reservation = await transaction.quotaReservation.findUnique({
        where: { id: reservationId },
      });
      if (!reservation) throw new ConflictException('Quota reservation not found');
      if (reservation.status === QuotaReservationStatus.COMMITTED) {
        return reservation;
      }
      if (
        reservation.status !== QuotaReservationStatus.ACTIVE ||
        reservation.expiresAt <= new Date()
      ) {
        if (
          reservation.status === QuotaReservationStatus.ACTIVE &&
          reservation.expiresAt <= new Date()
        ) {
          await transaction.quotaReservation.update({
            where: { id: reservation.id },
            data: { status: QuotaReservationStatus.EXPIRED },
          });
        }
        throw new ConflictException('Quota reservation is no longer active');
      }

      await transaction.usageLedgerEntry.upsert({
        where: {
          workspaceId_idempotencyKey: {
            workspaceId: reservation.workspaceId,
            idempotencyKey: `quota-reservation:${reservation.id}:commit`,
          },
        },
        update: {},
        create: {
          organizationId: reservation.organizationId,
          workspaceId: reservation.workspaceId,
          metric: reservation.metric,
          quantity: reservation.quantity,
          idempotencyKey: `quota-reservation:${reservation.id}:commit`,
          sourceType,
          sourceId: sourceId ?? null,
        },
      });
      return transaction.quotaReservation.update({
        where: { id: reservation.id },
        data: {
          status: QuotaReservationStatus.COMMITTED,
          committedAt: new Date(),
        },
      });
    });
  }

  async releaseReservation(reservationId: string) {
    return this.worker.quotaReservation.updateMany({
      where: {
        id: reservationId,
        status: QuotaReservationStatus.ACTIVE,
      },
      data: {
        status: QuotaReservationStatus.RELEASED,
        releasedAt: new Date(),
      },
    });
  }

  async reconcileAllWorkspaces(): Promise<void> {
    const batchSize = 100;
    let cursor: string | undefined;
    while (true) {
      const workspaces = await this.worker.workspace.findMany({
        select: { id: true, organizationId: true },
        orderBy: { id: 'asc' },
        take: batchSize,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (workspaces.length === 0) break;
      for (const workspace of workspaces) {
        await this.worker.$transaction((transaction) =>
          this.reconcileWorkspaceInTransaction(
            transaction,
            workspace.organizationId,
            workspace.id,
          ),
        );
      }
      cursor = workspaces.at(-1)?.id;
      if (workspaces.length < batchSize || !cursor) break;
    }
  }

  async syncProviderSubscription(input: {
    organizationId: string;
    workspaceId: string;
    planCode: PlanCode;
    status: WorkspaceSubscriptionStatus;
    provider: string;
    providerCustomerId?: string;
    providerSubscriptionId?: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    seatLimit?: number;
  }) {
    const definition = planDefinition(input.planCode);
    return this.worker.workspaceSubscription.upsert({
      where: { workspaceId: input.workspaceId },
      update: {
        planCode: input.planCode,
        status: input.status,
        seatLimit: input.seatLimit ?? definition.seatLimit,
        entitlements: definition.entitlements as Prisma.InputJsonValue,
        quotaLimits: definition.quotaLimits as Prisma.InputJsonValue,
        provider: input.provider,
        providerCustomerId: input.providerCustomerId ?? null,
        providerSubscriptionId: input.providerSubscriptionId ?? null,
        currentPeriodStart: input.currentPeriodStart,
        currentPeriodEnd: input.currentPeriodEnd,
      },
      create: {
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        planCode: input.planCode,
        status: input.status,
        seatLimit: input.seatLimit ?? definition.seatLimit,
        entitlements: definition.entitlements as Prisma.InputJsonValue,
        quotaLimits: definition.quotaLimits as Prisma.InputJsonValue,
        provider: input.provider,
        providerCustomerId: input.providerCustomerId ?? null,
        providerSubscriptionId: input.providerSubscriptionId ?? null,
        currentPeriodStart: input.currentPeriodStart,
        currentPeriodEnd: input.currentPeriodEnd,
      },
    });
  }

  private async ensureSubscription(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    workspaceId: string,
  ) {
    const existing = await transaction.workspaceSubscription.findUnique({
      where: { workspaceId },
    });
    if (existing) return existing;

    const definition = planDefinition(PlanCode.FREE);
    const period = currentUtcMonth();
    return transaction.workspaceSubscription.create({
      data: {
        organizationId,
        workspaceId,
        planCode: definition.code,
        status: WorkspaceSubscriptionStatus.ACTIVE,
        seatLimit: definition.seatLimit,
        entitlements: definition.entitlements as Prisma.InputJsonValue,
        quotaLimits: definition.quotaLimits as Prisma.InputJsonValue,
        currentPeriodStart: period.start,
        currentPeriodEnd: period.end,
      },
    });
  }

  private async reconcileWorkspaceInTransaction(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    workspaceId: string,
  ) {
    let subscription = await this.ensureSubscription(
      transaction,
      organizationId,
      workspaceId,
    );
    const now = new Date();

    if (!subscription.provider && subscription.currentPeriodEnd <= now) {
      const definition = planDefinition(subscription.planCode);
      const period = currentUtcMonth();
      subscription = await transaction.workspaceSubscription.update({
        where: { id: subscription.id },
        data: {
          seatLimit: definition.seatLimit,
          entitlements: definition.entitlements as Prisma.InputJsonValue,
          quotaLimits: definition.quotaLimits as Prisma.InputJsonValue,
          currentPeriodStart: period.start,
          currentPeriodEnd: period.end,
        },
      });
    }

    await transaction.quotaReservation.updateMany({
      where: {
        workspaceId,
        status: QuotaReservationStatus.ACTIVE,
        expiresAt: { lte: now },
      },
      data: { status: QuotaReservationStatus.EXPIRED },
    });
    const seatsUsed = await transaction.workspaceMembership.count({
      where: { workspaceId },
    });
    return transaction.workspaceSubscription.update({
      where: { id: subscription.id },
      data: {
        seatsUsed,
        lastReconciledAt: now,
      },
    });
  }

  private jsonQuotaLimits(value: Prisma.JsonValue): Record<string, number | null> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, number | null] =>
          entry[1] === null || typeof entry[1] === 'number',
      ),
    );
  }

  private quotaLimit(value: Prisma.JsonValue, metric: string): number | null {
    const limits = this.jsonQuotaLimits(value);
    const limit = limits[metric];
    return typeof limit === 'number' ? limit : null;
  }
}

function currentUtcMonth(): { start: Date; end: Date } {
  const now = new Date();
  return {
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  };
}
