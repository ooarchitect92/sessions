CREATE TYPE "WebhookDeliveryStatus" AS ENUM (
  'PENDING',
  'SENDING',
  'DELIVERED',
  'FAILED',
  'DEAD_LETTER'
);

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
  "next_attempt_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
  "last_attempt_at" TIMESTAMPTZ(6),
  "response_status" INTEGER,
  "response_body_snippet" VARCHAR(1000),
  "last_error" VARCHAR(1000),
  "delivered_at" TIMESTAMPTZ(6),
  "replay_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "webhook_deliveries_subscription_event_key"
  ON "webhook_deliveries"("subscription_id", "outbox_event_id");
CREATE INDEX "webhook_deliveries_org_workspace_status_next_idx"
  ON "webhook_deliveries"("organization_id", "workspace_id", "status", "next_attempt_at");
CREATE INDEX "webhook_deliveries_subscription_created_idx"
  ON "webhook_deliveries"("subscription_id", "created_at");

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

ALTER TABLE "webhook_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_deliveries" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_webhook_deliveries"
  ON "webhook_deliveries"
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
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE webhook_deliveries TO sessions_api;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE webhook_deliveries TO sessions_worker;
  END IF;
END $$;
