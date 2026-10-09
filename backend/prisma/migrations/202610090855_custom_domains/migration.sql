CREATE TABLE "custom_domains" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "workspace_id" UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "created_by_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "hostname" VARCHAR(253) NOT NULL,
  "verification_token" VARCHAR(96) NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  "tls_status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  "verified_at" TIMESTAMPTZ,
  "last_checked_at" TIMESTAMPTZ,
  "last_error" VARCHAR(1000),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("hostname")
);

CREATE INDEX "custom_domains_workspace_idx"
  ON "custom_domains" ("organization_id", "workspace_id", "created_at");

ALTER TABLE "custom_domains" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "custom_domains" FORCE ROW LEVEL SECURITY;

CREATE POLICY "custom_domains_tenant_isolation" ON "custom_domains"
USING (
  "organization_id" = current_setting('app.organization_id', true)::uuid
  AND "workspace_id" = current_setting('app.workspace_id', true)::uuid
)
WITH CHECK (
  "organization_id" = current_setting('app.organization_id', true)::uuid
  AND "workspace_id" = current_setting('app.workspace_id', true)::uuid
);