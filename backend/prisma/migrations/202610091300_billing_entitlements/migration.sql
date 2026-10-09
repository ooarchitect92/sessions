CREATE TABLE "plan_catalog" (
  "code" VARCHAR(40) PRIMARY KEY,
  "name" VARCHAR(100) NOT NULL,
  "monthly_price_cents" INTEGER NOT NULL DEFAULT 0,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
  "limits" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "features" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ("monthly_price_cents" >= 0)
);

CREATE TABLE "workspace_subscriptions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "workspace_id" UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "plan_code" VARCHAR(40) NOT NULL REFERENCES "plan_catalog"("code"),
  "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  "seat_quantity" INTEGER NOT NULL DEFAULT 1,
  "provider" VARCHAR(40),
  "provider_customer_id" VARCHAR(255),
  "provider_subscription_id" VARCHAR(255),
  "current_period_start" TIMESTAMPTZ NOT NULL DEFAULT date_trunc('month', NOW()),
  "current_period_end" TIMESTAMPTZ NOT NULL DEFAULT (date_trunc('month', NOW()) + INTERVAL '1 month'),
  "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("workspace_id"),
  CHECK ("seat_quantity" > 0),
  CHECK ("status" IN ('TRIALING','ACTIVE','PAST_DUE','CANCELLED'))
);

CREATE INDEX "workspace_subscriptions_tenant_idx"
  ON "workspace_subscriptions" ("organization_id", "workspace_id", "status");

CREATE TABLE "usage_ledger" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "workspace_id" UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "metric" VARCHAR(80) NOT NULL,
  "quantity" BIGINT NOT NULL DEFAULT 1,
  "source_type" VARCHAR(80) NOT NULL,
  "source_id" VARCHAR(255) NOT NULL,
  "period_start" TIMESTAMPTZ NOT NULL,
  "period_end" TIMESTAMPTZ NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("workspace_id", "metric", "source_type", "source_id"),
  CHECK ("quantity" >= 0)
);

CREATE INDEX "usage_ledger_period_idx"
  ON "usage_ledger" ("organization_id", "workspace_id", "metric", "period_start", "period_end");

INSERT INTO "plan_catalog" ("code", "name", "monthly_price_cents", "limits", "features") VALUES
  ('STARTER', 'Starter', 0,
    '{"seats":3,"sessionsPerMonth":30,"eventsPerMonth":5,"bookingPages":2,"eventCapacity":50}'::jsonb,
    '{"customDomains":false,"apiKeys":true,"webhooks":true,"ai":true}'::jsonb),
  ('TEAM', 'Team', 4900,
    '{"seats":15,"sessionsPerMonth":300,"eventsPerMonth":50,"bookingPages":20,"eventCapacity":250}'::jsonb,
    '{"customDomains":true,"apiKeys":true,"webhooks":true,"ai":true}'::jsonb),
  ('SCALE', 'Scale', 14900,
    '{"seats":100,"sessionsPerMonth":-1,"eventsPerMonth":-1,"bookingPages":-1,"eventCapacity":1000}'::jsonb,
    '{"customDomains":true,"apiKeys":true,"webhooks":true,"ai":true}'::jsonb)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "workspace_subscriptions" ("organization_id", "workspace_id", "plan_code", "status", "seat_quantity")
SELECT w."organization_id", w."id", 'STARTER', 'ACTIVE', 1
FROM "workspaces" w
ON CONFLICT ("workspace_id") DO NOTHING;

ALTER TABLE "workspace_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_subscriptions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "workspace_subscriptions_tenant_isolation" ON "workspace_subscriptions"
USING (
  "organization_id" = current_setting('app.organization_id', true)::uuid
  AND "workspace_id" = current_setting('app.workspace_id', true)::uuid
)
WITH CHECK (
  "organization_id" = current_setting('app.organization_id', true)::uuid
  AND "workspace_id" = current_setting('app.workspace_id', true)::uuid
);

ALTER TABLE "usage_ledger" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "usage_ledger" FORCE ROW LEVEL SECURITY;
CREATE POLICY "usage_ledger_tenant_isolation" ON "usage_ledger"
USING (
  "organization_id" = current_setting('app.organization_id', true)::uuid
  AND "workspace_id" = current_setting('app.workspace_id', true)::uuid
)
WITH CHECK (
  "organization_id" = current_setting('app.organization_id', true)::uuid
  AND "workspace_id" = current_setting('app.workspace_id', true)::uuid
);