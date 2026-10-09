CREATE TABLE "agenda_templates" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "workspace_id" UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "created_by_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "name" VARCHAR(160) NOT NULL,
  "description" VARCHAR(1000),
  "items" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("workspace_id", "name")
);

CREATE INDEX "agenda_templates_tenant_idx"
  ON "agenda_templates" ("organization_id", "workspace_id", "created_at" DESC);

ALTER TABLE "agenda_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agenda_templates" FORCE ROW LEVEL SECURITY;

CREATE POLICY "agenda_templates_tenant_isolation" ON "agenda_templates"
USING (
  "organization_id" = current_setting('app.organization_id', true)::uuid
  AND "workspace_id" = current_setting('app.workspace_id', true)::uuid
)
WITH CHECK (
  "organization_id" = current_setting('app.organization_id', true)::uuid
  AND "workspace_id" = current_setting('app.workspace_id', true)::uuid
);