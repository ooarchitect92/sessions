import { PlanCode } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { BILLING_METRICS, PLAN_CATALOG } from './billing-plans';

describe('billing plan catalog', () => {
  it('keeps seat limits and quotas monotonic across standard paid tiers', () => {
    expect(PLAN_CATALOG[PlanCode.PRO].seatLimit).toBeGreaterThan(
      PLAN_CATALOG[PlanCode.FREE].seatLimit,
    );
    expect(PLAN_CATALOG[PlanCode.BUSINESS].seatLimit).toBeGreaterThan(
      PLAN_CATALOG[PlanCode.PRO].seatLimit,
    );
    expect(
      PLAN_CATALOG[PlanCode.PRO].quotaLimits[
        BILLING_METRICS.WEBHOOK_DELIVERIES
      ] as number,
    ).toBeGreaterThan(
      PLAN_CATALOG[PlanCode.FREE].quotaLimits[
        BILLING_METRICS.WEBHOOK_DELIVERIES
      ] as number,
    );
  });

  it('uses null quotas to represent enterprise unlimited metrics', () => {
    expect(
      PLAN_CATALOG[PlanCode.ENTERPRISE].quotaLimits[
        BILLING_METRICS.STORAGE_BYTES
      ],
    ).toBeNull();
  });
});
