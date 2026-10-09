import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ADMIN_ROLES, hasAnyRole, type Principal } from '../common/auth/principal';
import { TenantDatabaseService } from '../database/tenant-database.service';

type BillingClient = Prisma.TransactionClient;
type PlanLimits = {
  seats: number;
  sessionsPerMonth: number;
  eventsPerMonth: number;
  bookingPages: number;
  eventCapacity: number;
};
type PlanFeatures = {
  customDomains?: boolean;
  apiKeys?: boolean;
  webhooks?: boolean;
  ai?: boolean;
};
type SubscriptionRow = {
  id: string;
  plan_code: string;
  status: string;
  seat_quantity: number;
  current_period_start: Date;
  current_period_end: Date;
  cancel_at_period_end: boolean;
  provider: string | null;
  plan_name: string;
  monthly_price_cents: number;
  currency: string;
  limits: PlanLimits;
  features: PlanFeatures;
};

@Injectable()
export class BillingService {
  constructor(private readonly database: TenantDatabaseService) {}

  async current(principal: Principal) {
    return this.database.run(principal, async (transaction) => {
      const subscription = await this.ensureSubscription(transaction, principal);
      const usage = await this.usageSnapshot(transaction, principal, subscription);
      return this.shape(subscription, usage);
    });
  }

  async catalog(principal: Principal) {
    if (!hasAnyRole(principal, ADMIN_ROLES)) {
      throw new ForbiddenException('Owner or admin role is required');
    }
    return this.database.run(principal, (transaction) =>
      transaction.$queryRaw<Array<{
        code: string;
        name: string;
        monthly_price_cents: number;
        currency: string;
        limits: PlanLimits;
        features: PlanFeatures;
      }>>`
        SELECT code, name, monthly_price_cents, currency, limits, features
        FROM plan_catalog
        WHERE active = TRUE
        ORDER BY monthly_price_cents ASC, code ASC
      `,
    );
  }

  async ensureSubscription(client: BillingClient, principal: Principal): Promise<SubscriptionRow> {
    await client.$executeRaw`
      INSERT INTO workspace_subscriptions (
        organization_id, workspace_id, plan_code, status, seat_quantity
      ) VALUES (
        ${principal.organizationId}::uuid,
        ${principal.workspaceId}::uuid,
        'STARTER',
        'ACTIVE',
        1
      )
      ON CONFLICT (workspace_id) DO NOTHING
    `;
    await client.$executeRaw`
      UPDATE workspace_subscriptions
      SET current_period_start = date_trunc('month', NOW()),
          current_period_end = date_trunc('month', NOW()) + INTERVAL '1 month',
          updated_at = NOW()
      WHERE workspace_id = ${principal.workspaceId}::uuid
        AND current_period_end <= NOW()
    `;
    const rows = await client.$queryRaw<SubscriptionRow[]>`
      SELECT
        s.id, s.plan_code, s.status, s.seat_quantity,
        s.current_period_start, s.current_period_end, s.cancel_at_period_end,
        s.provider, p.name AS plan_name, p.monthly_price_cents, p.currency,
        p.limits, p.features
      FROM workspace_subscriptions s
      JOIN plan_catalog p ON p.code = s.plan_code
      WHERE s.workspace_id = ${principal.workspaceId}::uuid
        AND s.organization_id = ${principal.organizationId}::uuid
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) throw new Error('workspace_subscription_invariant');
    return row;
  }

  async assertCanCreateSession(client: BillingClient, principal: Principal): Promise<void> {
    const subscription = await this.ensureSubscription(client, principal);
    this.assertSubscriptionActive(subscription);
    const limit = subscription.limits.sessionsPerMonth;
    if (limit < 0) return;
    const used = await client.session.count({
      where: {
        workspaceId: principal.workspaceId,
        createdAt: { gte: subscription.current_period_start, lt: subscription.current_period_end },
      },
    });
    this.assertWithin('sessions this billing period', used, limit);
  }

  async assertCanCreateEvent(
    client: BillingClient,
    principal: Principal,
    requestedCapacity?: number | null,
  ): Promise<void> {
    const subscription = await this.ensureSubscription(client, principal);
    this.assertSubscriptionActive(subscription);
    const monthlyLimit = subscription.limits.eventsPerMonth;
    if (monthlyLimit >= 0) {
      const used = await client.event.count({
        where: {
          workspaceId: principal.workspaceId,
          createdAt: { gte: subscription.current_period_start, lt: subscription.current_period_end },
        },
      });
      this.assertWithin('events this billing period', used, monthlyLimit);
    }
    if (requestedCapacity && subscription.limits.eventCapacity >= 0 && requestedCapacity > subscription.limits.eventCapacity) {
      throw new ForbiddenException(
        `Plan limit exceeded: event capacity is ${subscription.limits.eventCapacity}`,
      );
    }
  }

  async assertCanCreateBookingPage(client: BillingClient, principal: Principal): Promise<void> {
    const subscription = await this.ensureSubscription(client, principal);
    this.assertSubscriptionActive(subscription);
    const limit = subscription.limits.bookingPages;
    if (limit < 0) return;
    const used = await client.bookingPage.count({ where: { workspaceId: principal.workspaceId } });
    this.assertWithin('booking pages', used, limit);
  }

  async assertSeatAvailable(client: BillingClient, principal: Principal): Promise<void> {
    const subscription = await this.ensureSubscription(client, principal);
    this.assertSubscriptionActive(subscription);
    const limit = subscription.limits.seats;
    if (limit < 0) return;
    const [members, pendingInvites] = await Promise.all([
      client.workspaceMembership.count({ where: { workspaceId: principal.workspaceId } }),
      client.workspaceInvitation.count({
        where: {
          workspaceId: principal.workspaceId,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      }),
    ]);
    this.assertWithin('workspace seats', members + pendingInvites, limit);
  }

  async recordUsage(
    client: BillingClient,
    principal: Principal,
    metric: string,
    sourceType: string,
    sourceId: string,
    quantity = 1,
    metadata: Prisma.InputJsonValue = {},
  ): Promise<void> {
    const subscription = await this.ensureSubscription(client, principal);
    await client.$executeRaw`
      INSERT INTO usage_ledger (
        organization_id, workspace_id, metric, quantity, source_type, source_id,
        period_start, period_end, metadata
      ) VALUES (
        ${principal.organizationId}::uuid,
        ${principal.workspaceId}::uuid,
        ${metric},
        ${quantity},
        ${sourceType},
        ${sourceId},
        ${subscription.current_period_start},
        ${subscription.current_period_end},
        ${JSON.stringify(metadata)}::jsonb
      )
      ON CONFLICT (workspace_id, metric, source_type, source_id) DO NOTHING
    `;
  }

  private async usageSnapshot(client: BillingClient, principal: Principal, subscription: SubscriptionRow) {
    const [seats, sessions, events, bookingPages] = await Promise.all([
      client.workspaceMembership.count({ where: { workspaceId: principal.workspaceId } }),
      client.session.count({
        where: {
          workspaceId: principal.workspaceId,
          createdAt: { gte: subscription.current_period_start, lt: subscription.current_period_end },
        },
      }),
      client.event.count({
        where: {
          workspaceId: principal.workspaceId,
          createdAt: { gte: subscription.current_period_start, lt: subscription.current_period_end },
        },
      }),
      client.bookingPage.count({ where: { workspaceId: principal.workspaceId } }),
    ]);
    return { seats, sessions, events, bookingPages };
  }

  private shape(subscription: SubscriptionRow, usage: { seats: number; sessions: number; events: number; bookingPages: number }) {
    return {
      subscription: {
        id: subscription.id,
        planCode: subscription.plan_code,
        status: subscription.status,
        seatQuantity: subscription.seat_quantity,
        currentPeriodStart: subscription.current_period_start,
        currentPeriodEnd: subscription.current_period_end,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        provider: subscription.provider,
      },
      plan: {
        code: subscription.plan_code,
        name: subscription.plan_name,
        monthlyPriceCents: subscription.monthly_price_cents,
        currency: subscription.currency,
        limits: subscription.limits,
        features: subscription.features,
      },
      usage,
    };
  }

  private assertSubscriptionActive(subscription: SubscriptionRow): void {
    if (!['ACTIVE', 'TRIALING'].includes(subscription.status)) {
      throw new ForbiddenException(
        `Subscription is ${subscription.status.toLowerCase()}; new billable resources are blocked`,
      );
    }
  }
  private assertWithin(label: string, used: number, limit: number): void {
    if (used >= limit) {
      throw new ForbiddenException(`Plan limit exceeded: ${label} ${used}/${limit}`);
    }
  }
}