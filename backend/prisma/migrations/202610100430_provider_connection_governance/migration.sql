CREATE TYPE "ProviderConnectionKind" AS ENUM (
  'EMAIL_HTTP',
  'CRM_HTTP'
);

CREATE TYPE "ProviderConnectionStatus" AS ENUM (
  'ACTIVE',
  'DISABLED',
  'ERROR'
);

CREATE TABLE "provider_connections" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "created_by_id" UUID NOT NULL,
  "kind" "ProviderConnectionKind" NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "endpoint_url" TEXT NOT NULL,
  "secret_ciphertext" TEXT NOT NULL,
  "credential_version" INTEGER NOT NULL DEFAULT 1,
  "config" JSONB NOT NULL DEFAULT '{}',
  "status" "ProviderConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
  "last_used_at" TIMESTAMPTZ(6),
  "last_success_at" TIMESTAMPTZ(6),
  "last_failure_at" TIMESTAMPTZ(6),
  "last_error" VARCHAR(1000),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "provider_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "provider_connections_workspace_kind_key"
  ON "provider_connections"("workspace_id", "kind");
CREATE INDEX "provider_connections_org_workspace_status_idx"
  ON "provider_connections"("organization_id", "workspace_id", "status");

ALTER TABLE "provider_connections"
  ADD CONSTRAINT "provider_connections_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "provider_connections"
  ADD CONSTRAINT "provider_connections_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "provider_connections"
  ADD CONSTRAINT "provider_connections_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "provider_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "provider_connections" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_provider_connections"
  ON "provider_connections"
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
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE provider_connections TO sessions_api;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE provider_connections TO sessions_worker;
  END IF;
END $$;
