CREATE TYPE "EmailDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');

CREATE TABLE "email_deliveries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "memory_summary_id" UUID,
  "requested_by_user_id" UUID NOT NULL,
  "status" "EmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "provider" VARCHAR(100),
  "provider_message_id" VARCHAR(320),
  "recipients" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "subject" VARCHAR(300) NOT NULL,
  "body" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "failure_code" VARCHAR(320),
  "sent_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "email_deliveries_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "email_deliveries"
  ADD CONSTRAINT "email_deliveries_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "email_deliveries"
  ADD CONSTRAINT "email_deliveries_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "email_deliveries"
  ADD CONSTRAINT "email_deliveries_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "sessions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "email_deliveries"
  ADD CONSTRAINT "email_deliveries_memory_summary_id_fkey"
  FOREIGN KEY ("memory_summary_id") REFERENCES "memory_summaries"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "email_deliveries"
  ADD CONSTRAINT "email_deliveries_requested_by_user_id_fkey"
  FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "email_deliveries_organization_id_workspace_id_status_created_at_idx"
  ON "email_deliveries"("organization_id", "workspace_id", "status", "created_at");

CREATE INDEX "email_deliveries_session_id_created_at_idx"
  ON "email_deliveries"("session_id", "created_at");

CREATE INDEX "email_deliveries_memory_summary_id_idx"
  ON "email_deliveries"("memory_summary_id");

ALTER TABLE "email_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "email_deliveries" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_email_deliveries"
  ON "email_deliveries"
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
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "email_deliveries" TO sessions_api;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "email_deliveries" TO sessions_worker;
  END IF;
END $$;
