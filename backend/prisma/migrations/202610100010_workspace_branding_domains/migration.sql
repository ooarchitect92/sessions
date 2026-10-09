CREATE TYPE "WorkspaceDomainStatus" AS ENUM ('PENDING', 'VERIFIED');

CREATE TABLE "workspace_domains" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "hostname" VARCHAR(253) NOT NULL,
  "status" "WorkspaceDomainStatus" NOT NULL DEFAULT 'PENDING',
  "verification_token" VARCHAR(96) NOT NULL,
  "verified_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspace_domains_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_domains_hostname_key" ON "workspace_domains"("hostname");
CREATE INDEX "workspace_domains_organization_id_workspace_id_status_idx"
  ON "workspace_domains"("organization_id", "workspace_id", "status");

ALTER TABLE "workspace_domains"
  ADD CONSTRAINT "workspace_domains_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_domains"
  ADD CONSTRAINT "workspace_domains_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workspace_domains" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_domains" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_workspace_domains" ON "workspace_domains"
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
    GRANT SELECT, INSERT, UPDATE, DELETE ON workspace_domains TO sessions_api;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON workspace_domains TO sessions_worker;
  END IF;
END $$;
