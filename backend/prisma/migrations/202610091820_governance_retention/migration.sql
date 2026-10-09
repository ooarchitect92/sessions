CREATE TABLE "workspace_retention_policies" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "workspace_id" UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "recording_days" INTEGER NOT NULL DEFAULT 30,
  "transcript_days" INTEGER NOT NULL DEFAULT 90,
  "audit_days" INTEGER NOT NULL DEFAULT 365,
  "delete_on_expiry" BOOLEAN NOT NULL DEFAULT TRUE,
  "legal_hold" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("workspace_id"),
  CHECK ("recording_days" BETWEEN 1 AND 3650),
  CHECK ("transcript_days" BETWEEN 1 AND 3650),
  CHECK ("audit_days" BETWEEN 30 AND 3650)
);

INSERT INTO "workspace_retention_policies" ("organization_id", "workspace_id")
SELECT "organization_id", "id" FROM "workspaces"
ON CONFLICT ("workspace_id") DO NOTHING;

CREATE INDEX "workspace_retention_policies_tenant_idx"
  ON "workspace_retention_policies" ("organization_id", "workspace_id");

ALTER TABLE "workspace_retention_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_retention_policies" FORCE ROW LEVEL SECURITY;
CREATE POLICY "workspace_retention_policies_tenant_isolation" ON "workspace_retention_policies"
USING (
  "organization_id" = current_setting('app.organization_id', true)::uuid
  AND "workspace_id" = current_setting('app.workspace_id', true)::uuid
)
WITH CHECK (
  "organization_id" = current_setting('app.organization_id', true)::uuid
  AND "workspace_id" = current_setting('app.workspace_id', true)::uuid
);