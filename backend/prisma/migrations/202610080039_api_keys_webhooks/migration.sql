CREATE TABLE "api_keys" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "workspace_id" UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "created_by_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "name" VARCHAR(120) NOT NULL,
  "key_prefix" VARCHAR(24) NOT NULL,
  "key_hash" VARCHAR(64) NOT NULL UNIQUE,
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "last_used_at" TIMESTAMPTZ,
  "expires_at" TIMESTAMPTZ,
  "revoked_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "webhook_subscriptions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "workspace_id" UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "created_by_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "name" VARCHAR(120) NOT NULL,
  "endpoint_url" TEXT NOT NULL,
  "event_types" TEXT[] NOT NULL,
  "secret_ciphertext" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "last_success_at" TIMESTAMPTZ,
  "last_failure_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "webhook_deliveries" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "workspace_id" UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "subscription_id" UUID NOT NULL REFERENCES "webhook_subscriptions"("id") ON DELETE CASCADE,
  "outbox_event_id" UUID NOT NULL REFERENCES "outbox_events"("id") ON DELETE CASCADE,
  "event_type" VARCHAR(160) NOT NULL,
  "payload" JSONB NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "available_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "locked_at" TIMESTAMPTZ,
  "locked_by" VARCHAR(160),
  "response_status" INTEGER,
  "last_error" VARCHAR(4000),
  "delivered_at" TIMESTAMPTZ,
  "dead_lettered_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("subscription_id", "outbox_event_id")
);

CREATE INDEX "api_keys_workspace_active_idx" ON "api_keys" ("organization_id","workspace_id","created_at") WHERE "revoked_at" IS NULL;
CREATE INDEX "webhook_subscriptions_workspace_idx" ON "webhook_subscriptions" ("organization_id","workspace_id","active");
CREATE INDEX "webhook_deliveries_dispatch_idx" ON "webhook_deliveries" ("status","available_at","created_at");

ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "api_keys" FORCE ROW LEVEL SECURITY;
ALTER TABLE "webhook_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_subscriptions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "webhook_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_deliveries" FORCE ROW LEVEL SECURITY;

CREATE POLICY "api_keys_tenant_isolation" ON "api_keys"
USING ("organization_id" = current_setting('app.organization_id', true)::uuid AND "workspace_id" = current_setting('app.workspace_id', true)::uuid)
WITH CHECK ("organization_id" = current_setting('app.organization_id', true)::uuid AND "workspace_id" = current_setting('app.workspace_id', true)::uuid);

CREATE POLICY "webhook_subscriptions_tenant_isolation" ON "webhook_subscriptions"
USING ("organization_id" = current_setting('app.organization_id', true)::uuid AND "workspace_id" = current_setting('app.workspace_id', true)::uuid)
WITH CHECK ("organization_id" = current_setting('app.organization_id', true)::uuid AND "workspace_id" = current_setting('app.workspace_id', true)::uuid);

CREATE POLICY "webhook_deliveries_tenant_isolation" ON "webhook_deliveries"
USING ("organization_id" = current_setting('app.organization_id', true)::uuid AND "workspace_id" = current_setting('app.workspace_id', true)::uuid)
WITH CHECK ("organization_id" = current_setting('app.organization_id', true)::uuid AND "workspace_id" = current_setting('app.workspace_id', true)::uuid);
