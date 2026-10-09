CREATE TYPE "PlanCode" AS ENUM (
  'FREE',
  'PRO',
  'BUSINESS',
  'ENTERPRISE'
);

CREATE TYPE "WorkspaceSubscriptionStatus" AS ENUM (
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'CANCELED'
);

CREATE TYPE "QuotaReservationStatus" AS ENUM (
  'ACTIVE',
  'COMMITTED',
  'RELEASED',
  'EXPIRED'
);

CREATE TABLE "workspace_subscriptions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "plan_code" "PlanCode" NOT NULL DEFAULT 'FREE',
  "status" "WorkspaceSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
  "seat_limit" INTEGER NOT NULL DEFAULT 5,
  "seats_used" INTEGER NOT NULL DEFAULT 0,
  "entitlements" JSONB NOT NULL DEFAULT '{}',
  "quota_limits" JSONB NOT NULL DEFAULT '{}',
  "provider" VARCHAR(80),
  "provider_customer_id" VARCHAR(255),
  "provider_subscription_id" VARCHAR(255),
  "current_period_start" TIMESTAMPTZ(6) NOT NULL,
  "current_period_end" TIMESTAMPTZ(6) NOT NULL,
  "last_reconciled_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspace_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_subscriptions_workspace_id_key"
  ON "workspace_subscriptions"("workspace_id");
CREATE UNIQUE INDEX "workspace_subscriptions_provider_subscription_key"
  ON "workspace_subscriptions"("provider", "provider_subscription_id");
CREATE INDEX "workspace_subscriptions_org_workspace_status_idx"
  ON "workspace_subscriptions"("organization_id", "workspace_id", "status");

CREATE TABLE "usage_ledger_entries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "metric" VARCHAR(80) NOT NULL,
  "quantity" BIGINT NOT NULL,
  "idempotency_key" VARCHAR(200) NOT NULL,
  "source_type" VARCHAR(100) NOT NULL,
  "source_id" VARCHAR(200),
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "usage_ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "usage_ledger_workspace_idempotency_key"
  ON "usage_ledger_entries"("workspace_id", "idempotency_key");
CREATE INDEX "usage_ledger_org_workspace_metric_occurred_idx"
  ON "usage_ledger_entries"("organization_id", "workspace_id", "metric", "occurred_at");

CREATE TABLE "quota_reservations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "metric" VARCHAR(80) NOT NULL,
  "quantity" BIGINT NOT NULL,
  "reservation_key" VARCHAR(200) NOT NULL,
  "status" "QuotaReservationStatus" NOT NULL DEFAULT 'ACTIVE',
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "committed_at" TIMESTAMPTZ(6),
  "released_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "quota_reservations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "quota_reservations_workspace_key"
  ON "quota_reservations"("workspace_id", "reservation_key");
CREATE INDEX "quota_reservations_org_workspace_metric_status_expiry_idx"
  ON "quota_reservations"("organization_id", "workspace_id", "metric", "status", "expires_at");

ALTER TABLE "workspace_subscriptions"
  ADD CONSTRAINT "workspace_subscriptions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_subscriptions"
  ADD CONSTRAINT "workspace_subscriptions_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "usage_ledger_entries"
  ADD CONSTRAINT "usage_ledger_entries_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "usage_ledger_entries"
  ADD CONSTRAINT "usage_ledger_entries_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "quota_reservations"
  ADD CONSTRAINT "quota_reservations_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quota_reservations"
  ADD CONSTRAINT "quota_reservations_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workspace_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_subscriptions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "usage_ledger_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "usage_ledger_entries" FORCE ROW LEVEL SECURITY;
ALTER TABLE "quota_reservations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "quota_reservations" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_workspace_subscriptions"
  ON "workspace_subscriptions"
  USING (
    organization_id = app.current_organization_id()
    AND workspace_id = app.current_workspace_id()
  )
  WITH CHECK (
    organization_id = app.current_organization_id()
    AND workspace_id = app.current_workspace_id()
  );

CREATE POLICY "tenant_isolation_usage_ledger_entries"
  ON "usage_ledger_entries"
  USING (
    organization_id = app.current_organization_id()
    AND workspace_id = app.current_workspace_id()
  )
  WITH CHECK (
    organization_id = app.current_organization_id()
    AND workspace_id = app.current_workspace_id()
  );

CREATE POLICY "tenant_isolation_quota_reservations"
  ON "quota_reservations"
  USING (
    organization_id = app.current_organization_id()
    AND workspace_id = app.current_workspace_id()
  )
  WITH CHECK (
    organization_id = app.current_organization_id()
    AND workspace_id = app.current_workspace_id()
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_api') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE workspace_subscriptions TO sessions_api;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE usage_ledger_entries TO sessions_api;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE quota_reservations TO sessions_api;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE workspace_subscriptions TO sessions_worker;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE usage_ledger_entries TO sessions_worker;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE quota_reservations TO sessions_worker;
  END IF;
END $$;
