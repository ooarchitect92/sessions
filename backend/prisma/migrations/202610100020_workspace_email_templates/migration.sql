CREATE TYPE "WorkspaceEmailTemplateKind" AS ENUM (
  'BOOKING_REMINDER_24H',
  'BOOKING_REMINDER_1H',
  'EVENT_REMINDER_24H',
  'EVENT_REMINDER_1H'
);

CREATE TABLE "workspace_email_templates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "kind" "WorkspaceEmailTemplateKind" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "subject" VARCHAR(240) NOT NULL,
  "body_text" TEXT NOT NULL,
  "signature_text" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspace_email_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_email_templates_workspace_id_kind_key"
  ON "workspace_email_templates"("workspace_id", "kind");
CREATE INDEX "workspace_email_templates_organization_id_workspace_id_kind_idx"
  ON "workspace_email_templates"("organization_id", "workspace_id", "kind");

ALTER TABLE "workspace_email_templates"
  ADD CONSTRAINT "workspace_email_templates_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_email_templates"
  ADD CONSTRAINT "workspace_email_templates_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workspace_email_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_email_templates" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_workspace_email_templates"
  ON "workspace_email_templates"
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
    GRANT SELECT, INSERT, UPDATE, DELETE ON workspace_email_templates TO sessions_api;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON workspace_email_templates TO sessions_worker;
  END IF;
END $$;
