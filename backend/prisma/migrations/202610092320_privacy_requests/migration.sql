CREATE TABLE "privacy_requests" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "workspace_id" UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" VARCHAR(16) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'COMPLETED',
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "requested_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "completed_at" TIMESTAMPTZ,
  CHECK ("type" IN ('EXPORT','ERASURE')),
  CHECK ("status" IN ('PENDING','PROCESSING','COMPLETED','FAILED'))
);

CREATE INDEX "privacy_requests_user_idx" ON "privacy_requests" ("user_id", "requested_at" DESC);
CREATE INDEX "privacy_requests_tenant_idx" ON "privacy_requests" ("organization_id", "workspace_id", "requested_at" DESC);

ALTER TABLE "privacy_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "privacy_requests" FORCE ROW LEVEL SECURITY;
CREATE POLICY "privacy_requests_tenant_isolation" ON "privacy_requests"
USING ("organization_id" = current_setting('app.organization_id', true)::uuid AND "workspace_id" = current_setting('app.workspace_id', true)::uuid)
WITH CHECK ("organization_id" = current_setting('app.organization_id', true)::uuid AND "workspace_id" = current_setting('app.workspace_id', true)::uuid);