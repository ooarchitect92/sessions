CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING','DELIVERING','DELIVERED','FAILED','DEAD_LETTER');

CREATE TABLE "api_keys" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "prefix" VARCHAR(32) NOT NULL,
  "key_hash" VARCHAR(64) NOT NULL,
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "expires_at" TIMESTAMPTZ(6),
  "revoked_at" TIMESTAMPTZ(6),
  "last_used_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");
CREATE INDEX "api_keys_organization_id_workspace_id_created_at_idx" ON "api_keys"("organization_id","workspace_id","created_at");
CREATE INDEX "api_keys_workspace_id_revoked_at_expires_at_idx" ON "api_keys"("workspace_id","revoked_at","expires_at");
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "webhook_subscriptions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "url" TEXT NOT NULL,
  "encrypted_secret" TEXT NOT NULL,
  "event_types" TEXT[] NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhook_subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "webhook_subscriptions_workspace_id_name_key" ON "webhook_subscriptions"("workspace_id","name");
CREATE INDEX "webhook_subscriptions_organization_id_workspace_id_active_idx" ON "webhook_subscriptions"("organization_id","workspace_id","active");
ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "webhook_deliveries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "subscription_id" UUID NOT NULL,
  "outbox_event_id" UUID NOT NULL,
  "event_type" VARCHAR(160) NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "locked_at" TIMESTAMPTZ(6),
  "locked_by" VARCHAR(160),
  "response_status" INTEGER,
  "last_error" TEXT,
  "delivered_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "webhook_deliveries_subscription_id_outbox_event_id_key" ON "webhook_deliveries"("subscription_id","outbox_event_id");
CREATE INDEX "webhook_deliveries_organization_id_workspace_id_created_at_idx" ON "webhook_deliveries"("organization_id","workspace_id","created_at");
CREATE INDEX "webhook_deliveries_status_available_at_locked_at_idx" ON "webhook_deliveries"("status","available_at","locked_at");
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "webhook_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_outbox_event_id_fkey" FOREIGN KEY ("outbox_event_id") REFERENCES "outbox_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "api_keys" FORCE ROW LEVEL SECURITY;
ALTER TABLE "webhook_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_subscriptions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "webhook_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_deliveries" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_api_keys" ON "api_keys" USING (organization_id=app.current_organization_id() AND workspace_id=app.current_workspace_id()) WITH CHECK (organization_id=app.current_organization_id() AND workspace_id=app.current_workspace_id());
CREATE POLICY "tenant_isolation_webhook_subscriptions" ON "webhook_subscriptions" USING (organization_id=app.current_organization_id() AND workspace_id=app.current_workspace_id()) WITH CHECK (organization_id=app.current_organization_id() AND workspace_id=app.current_workspace_id());
CREATE POLICY "tenant_isolation_webhook_deliveries" ON "webhook_deliveries" USING (organization_id=app.current_organization_id() AND workspace_id=app.current_workspace_id()) WITH CHECK (organization_id=app.current_organization_id() AND workspace_id=app.current_workspace_id());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sessions_api') THEN
    GRANT SELECT,INSERT,UPDATE,DELETE ON api_keys,webhook_subscriptions,webhook_deliveries TO sessions_api;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sessions_worker') THEN
    GRANT SELECT,INSERT,UPDATE,DELETE ON api_keys,webhook_subscriptions,webhook_deliveries TO sessions_worker;
  END IF;
END $$;
