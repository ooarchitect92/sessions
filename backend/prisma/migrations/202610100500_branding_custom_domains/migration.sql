CREATE TYPE "CustomDomainStatus" AS ENUM (
  'PENDING_VERIFICATION',
  'VERIFIED',
  'DISABLED',
  'ERROR'
);

CREATE TYPE "CustomDomainTlsStatus" AS ENUM (
  'NOT_REQUESTED',
  'PENDING',
  'ACTIVE',
  'ERROR'
);

CREATE TABLE "workspace_brandings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "display_name" VARCHAR(160),
  "logo_url" TEXT,
  "favicon_url" TEXT,
  "primary_color" VARCHAR(7),
  "accent_color" VARCHAR(7),
  "email_from_name" VARCHAR(160),
  "support_url" TEXT,
  "hide_sessions_branding" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspace_brandings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_brandings_workspace_id_key"
  ON "workspace_brandings"("workspace_id");
CREATE INDEX "workspace_brandings_org_workspace_idx"
  ON "workspace_brandings"("organization_id", "workspace_id");

CREATE TABLE "custom_domains" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "hostname" CITEXT NOT NULL,
  "verification_name" VARCHAR(253) NOT NULL,
  "verification_value" VARCHAR(255) NOT NULL,
  "status" "CustomDomainStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
  "tls_status" "CustomDomainTlsStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
  "verified_at" TIMESTAMPTZ(6),
  "last_checked_at" TIMESTAMPTZ(6),
  "tls_provisioned_at" TIMESTAMPTZ(6),
  "last_error" VARCHAR(1000),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "custom_domains_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "custom_domains_hostname_key"
  ON "custom_domains"("hostname");
CREATE INDEX "custom_domains_org_workspace_status_idx"
  ON "custom_domains"("organization_id", "workspace_id", "status");
CREATE INDEX "custom_domains_workspace_created_idx"
  ON "custom_domains"("workspace_id", "created_at");

ALTER TABLE "workspace_brandings"
  ADD CONSTRAINT "workspace_brandings_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_brandings"
  ADD CONSTRAINT "workspace_brandings_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "custom_domains"
  ADD CONSTRAINT "custom_domains_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "custom_domains"
  ADD CONSTRAINT "custom_domains_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workspace_brandings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_brandings" FORCE ROW LEVEL SECURITY;
ALTER TABLE "custom_domains" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "custom_domains" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_workspace_brandings"
  ON "workspace_brandings"
  USING (
    organization_id = app.current_organization_id()
    AND workspace_id = app.current_workspace_id()
  )
  WITH CHECK (
    organization_id = app.current_organization_id()
    AND workspace_id = app.current_workspace_id()
  );

CREATE POLICY "tenant_isolation_custom_domains"
  ON "custom_domains"
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
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE workspace_brandings TO sessions_api;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE custom_domains TO sessions_api;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE workspace_brandings TO sessions_worker;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE custom_domains TO sessions_worker;
  END IF;
END $$;
