CREATE TABLE "workspace_email_templates" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "workspace_id" UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "kind" VARCHAR(64) NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "subject" VARCHAR(240) NOT NULL,
  "body_text" TEXT NOT NULL,
  "signature" TEXT NOT NULL DEFAULT '',
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("workspace_id", "kind"),
  CHECK ("kind" IN (
    'EVENT_REMINDER_24H',
    'EVENT_REMINDER_1H',
    'BOOKING_REMINDER_24H',
    'BOOKING_REMINDER_1H'
  ))
);

CREATE INDEX "workspace_email_templates_tenant_idx"
  ON "workspace_email_templates" ("organization_id", "workspace_id", "kind");

ALTER TABLE "workspace_email_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_email_templates" FORCE ROW LEVEL SECURITY;

CREATE POLICY "workspace_email_templates_tenant_isolation"
ON "workspace_email_templates"
USING (
  "organization_id" = current_setting('app.organization_id', true)::uuid
  AND "workspace_id" = current_setting('app.workspace_id', true)::uuid
)
WITH CHECK (
  "organization_id" = current_setting('app.organization_id', true)::uuid
  AND "workspace_id" = current_setting('app.workspace_id', true)::uuid
);