CREATE TYPE "FileAssetStatus" AS ENUM (
  'PENDING_UPLOAD',
  'QUARANTINED',
  'SCANNING',
  'READY',
  'REJECTED',
  'FAILED',
  'DELETED'
);

CREATE TABLE "file_assets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "session_id" UUID,
  "created_by_id" UUID NOT NULL,
  "filename" VARCHAR(255) NOT NULL,
  "mime_type" VARCHAR(160) NOT NULL,
  "size_bytes" BIGINT NOT NULL,
  "checksum_sha256" VARCHAR(64),
  "quarantine_key" TEXT NOT NULL,
  "clean_object_key" TEXT,
  "status" "FileAssetStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
  "scan_provider" VARCHAR(80),
  "scan_result" VARCHAR(500),
  "scan_attempts" INTEGER NOT NULL DEFAULT 0,
  "last_scan_error" TEXT,
  "uploaded_at" TIMESTAMPTZ(6),
  "scanned_at" TIMESTAMPTZ(6),
  "deleted_at" TIMESTAMPTZ(6),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "file_assets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "file_assets_size_bytes_check" CHECK ("size_bytes" > 0),
  CONSTRAINT "file_assets_scan_attempts_check" CHECK ("scan_attempts" >= 0),
  CONSTRAINT "file_assets_version_check" CHECK ("version" > 0),
  CONSTRAINT "file_assets_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "file_assets_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "file_assets_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "sessions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "file_assets_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "file_assets_quarantine_key_key"
  ON "file_assets"("quarantine_key");

CREATE UNIQUE INDEX "file_assets_clean_object_key_key"
  ON "file_assets"("clean_object_key");

CREATE INDEX "file_assets_organization_id_workspace_id_created_at_idx"
  ON "file_assets"("organization_id", "workspace_id", "created_at");

CREATE INDEX "file_assets_session_id_status_created_at_idx"
  ON "file_assets"("session_id", "status", "created_at");

CREATE INDEX "file_assets_workspace_id_status_created_at_idx"
  ON "file_assets"("workspace_id", "status", "created_at");

ALTER TABLE "file_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "file_assets" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_file_assets" ON "file_assets"
  USING (
    "organization_id" = app.current_organization_id()
    AND "workspace_id" = app.current_workspace_id()
  )
  WITH CHECK (
    "organization_id" = app.current_organization_id()
    AND "workspace_id" = app.current_workspace_id()
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_api') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE file_assets TO sessions_api;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE file_assets TO sessions_worker;
  END IF;
END $$;
