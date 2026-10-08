CREATE TYPE "AiExternalActionKind" AS ENUM ('EMAIL_FOLLOW_UP', 'CRM_NOTE');
CREATE TYPE "AiExternalActionStatus" AS ENUM (
  'DRAFT',
  'APPROVED',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED'
);

CREATE TABLE "ai_external_actions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "kind" "AiExternalActionKind" NOT NULL,
  "status" "AiExternalActionStatus" NOT NULL DEFAULT 'DRAFT',
  "source_summary_version" INTEGER NOT NULL,
  "draft_provider" VARCHAR(100),
  "draft_model" VARCHAR(160),
  "recipient_email" CITEXT,
  "subject" VARCHAR(240),
  "body_text" TEXT NOT NULL,
  "target_provider" VARCHAR(80),
  "target_record_id" VARCHAR(255),
  "approved_by_id" UUID,
  "approved_at" TIMESTAMPTZ(6),
  "execution_provider" VARCHAR(100),
  "provider_reference_id" VARCHAR(255),
  "failure_code" VARCHAR(500),
  "executed_at" TIMESTAMPTZ(6),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_external_actions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_external_actions_org_workspace_session_created_idx"
  ON "ai_external_actions"("organization_id", "workspace_id", "session_id", "created_at");
CREATE INDEX "ai_external_actions_status_updated_idx"
  ON "ai_external_actions"("status", "updated_at");

ALTER TABLE "ai_external_actions"
  ADD CONSTRAINT "ai_external_actions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_external_actions"
  ADD CONSTRAINT "ai_external_actions_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_external_actions"
  ADD CONSTRAINT "ai_external_actions_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "sessions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_external_actions"
  ADD CONSTRAINT "ai_external_actions_approved_by_id_fkey"
  FOREIGN KEY ("approved_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ai_external_actions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_external_actions" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_ai_external_actions"
  ON "ai_external_actions"
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
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ai_external_actions TO sessions_api;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ai_external_actions TO sessions_worker;
  END IF;
END $$;
