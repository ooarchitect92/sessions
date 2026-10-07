CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'DELIVERED', 'FAILED');

CREATE TABLE "webhook_subscriptions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "url" TEXT NOT NULL,
  "encrypted_secret" TEXT NOT NULL,
  "event_types" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "webhook_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "webhook_deliveries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "subscription_id" UUID NOT NULL,
  "outbox_event_id" UUID NOT NULL,
  "event_type" VARCHAR(160) NOT NULL,
  "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_status_code" INTEGER,
  "last_response_body" TEXT,
  "last_error" TEXT,
  "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "delivered_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "webhook_subscriptions"
  ADD CONSTRAINT "webhook_subscriptions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "webhook_subscriptions"
  ADD CONSTRAINT "webhook_subscriptions_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "webhook_subscriptions"
  ADD CONSTRAINT "webhook_subscriptions_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "webhook_deliveries"
  ADD CONSTRAINT "webhook_deliveries_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "webhook_deliveries"
  ADD CONSTRAINT "webhook_deliveries_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "webhook_deliveries"
  ADD CONSTRAINT "webhook_deliveries_subscription_id_fkey"
  FOREIGN KEY ("subscription_id") REFERENCES "webhook_subscriptions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "webhook_deliveries"
  ADD CONSTRAINT "webhook_deliveries_outbox_event_id_fkey"
  FOREIGN KEY ("outbox_event_id") REFERENCES "outbox_events"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "webhook_subscriptions_organization_id_workspace_id_active_idx"
  ON "webhook_subscriptions"("organization_id", "workspace_id", "active");
CREATE UNIQUE INDEX "webhook_deliveries_subscription_id_outbox_event_id_key"
  ON "webhook_deliveries"("subscription_id", "outbox_event_id");
CREATE INDEX "webhook_deliveries_organization_id_workspace_id_status_next_attempt_at_idx"
  ON "webhook_deliveries"("organization_id", "workspace_id", "status", "next_attempt_at");
CREATE INDEX "webhook_deliveries_subscription_id_created_at_idx"
  ON "webhook_deliveries"("subscription_id", "created_at");

ALTER TABLE "webhook_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_subscriptions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "webhook_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_deliveries" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_webhook_subscriptions"
  ON "webhook_subscriptions"
  USING (
    "organization_id" = app.current_organization_id()
    AND "workspace_id" = app.current_workspace_id()
  )
  WITH CHECK (
    "organization_id" = app.current_organization_id()
    AND "workspace_id" = app.current_workspace_id()
  );

CREATE POLICY "tenant_isolation_webhook_deliveries"
  ON "webhook_deliveries"
  USING (
    "organization_id" = app.current_organization_id()
    AND "workspace_id" = app.current_workspace_id()
  )
  WITH CHECK (
    "organization_id" = app.current_organization_id()
    AND "workspace_id" = app.current_workspace_id()
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_api') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "webhook_subscriptions" TO sessions_api;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "webhook_deliveries" TO sessions_api;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "webhook_subscriptions" TO sessions_worker;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "webhook_deliveries" TO sessions_worker;
  END IF;
END $$;
