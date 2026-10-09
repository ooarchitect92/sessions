import { PlanCode } from '@prisma/client';

export interface PlanDefinition {
  code: PlanCode;
  name: string;
  seatLimit: number;
  entitlements: Record<string, boolean>;
  quotaLimits: Record<string, number | null>;
}

export const BILLING_METRICS = {
  WEBHOOK_DELIVERIES: 'webhook_deliveries',
  AI_EXTERNAL_ACTIONS: 'ai_external_actions',
  RECORDING_MINUTES: 'recording_minutes',
  TRANSCRIPTION_SECONDS: 'transcription_seconds',
  STORAGE_BYTES: 'storage_bytes',
} as const;

export const PLAN_CATALOG: Record<PlanCode, PlanDefinition> = {
  [PlanCode.FREE]: {
    code: PlanCode.FREE,
    name: 'Free',
    seatLimit: 5,
    entitlements: {
      workspaceAnalytics: true,
      analyticsExports: true,
      customDomains: true,
      apiKeys: true,
      webhooks: true,
      aiFollowUps: true,
    },
    quotaLimits: {
      [BILLING_METRICS.WEBHOOK_DELIVERIES]: 10_000,
      [BILLING_METRICS.AI_EXTERNAL_ACTIONS]: 250,
      [BILLING_METRICS.RECORDING_MINUTES]: 600,
      [BILLING_METRICS.TRANSCRIPTION_SECONDS]: 36_000,
      [BILLING_METRICS.STORAGE_BYTES]: 5_000_000_000,
    },
  },
  [PlanCode.PRO]: {
    code: PlanCode.PRO,
    name: 'Pro',
    seatLimit: 25,
    entitlements: {
      workspaceAnalytics: true,
      analyticsExports: true,
      customDomains: true,
      apiKeys: true,
      webhooks: true,
      aiFollowUps: true,
    },
    quotaLimits: {
      [BILLING_METRICS.WEBHOOK_DELIVERIES]: 100_000,
      [BILLING_METRICS.AI_EXTERNAL_ACTIONS]: 2_500,
      [BILLING_METRICS.RECORDING_MINUTES]: 6_000,
      [BILLING_METRICS.TRANSCRIPTION_SECONDS]: 360_000,
      [BILLING_METRICS.STORAGE_BYTES]: 50_000_000_000,
    },
  },
  [PlanCode.BUSINESS]: {
    code: PlanCode.BUSINESS,
    name: 'Business',
    seatLimit: 100,
    entitlements: {
      workspaceAnalytics: true,
      analyticsExports: true,
      customDomains: true,
      apiKeys: true,
      webhooks: true,
      aiFollowUps: true,
    },
    quotaLimits: {
      [BILLING_METRICS.WEBHOOK_DELIVERIES]: 1_000_000,
      [BILLING_METRICS.AI_EXTERNAL_ACTIONS]: 25_000,
      [BILLING_METRICS.RECORDING_MINUTES]: 60_000,
      [BILLING_METRICS.TRANSCRIPTION_SECONDS]: 3_600_000,
      [BILLING_METRICS.STORAGE_BYTES]: 500_000_000_000,
    },
  },
  [PlanCode.ENTERPRISE]: {
    code: PlanCode.ENTERPRISE,
    name: 'Enterprise',
    seatLimit: 10_000,
    entitlements: {
      workspaceAnalytics: true,
      analyticsExports: true,
      customDomains: true,
      apiKeys: true,
      webhooks: true,
      aiFollowUps: true,
    },
    quotaLimits: {
      [BILLING_METRICS.WEBHOOK_DELIVERIES]: null,
      [BILLING_METRICS.AI_EXTERNAL_ACTIONS]: null,
      [BILLING_METRICS.RECORDING_MINUTES]: null,
      [BILLING_METRICS.TRANSCRIPTION_SECONDS]: null,
      [BILLING_METRICS.STORAGE_BYTES]: null,
    },
  },
};

export function planDefinition(code: PlanCode): PlanDefinition {
  return PLAN_CATALOG[code];
}
