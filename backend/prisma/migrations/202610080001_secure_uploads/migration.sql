CREATE TYPE "UploadStatus" AS ENUM (
  'AWAITING_UPLOAD',
  'PENDING_SCAN',
  'SCANNING',
  'READY',
  'REJECTED',
  'FAILED',
  'DELETED'
);

CREATE TYPE "UploadPurpose" AS ENUM (
  'SESSION_RESOURCE',
  'AGENDA_RESOURCE',
  'EVENT_RESOURCE'
);

CREATE TABLE "upload_assets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "session_id" UUID,
  "created_by_id" UUID NOT NULL,
  "purpose" "UploadPurpose" NOT NULL,
  "status" "UploadStatus" NOT NULL DEFAULT 'AWAITING_UPLOAD',
  "original_filename" VARCHAR(255) NOT NULL,
  "mime_type" VARCHAR(160) NOT NULL,
  "expected_size_bytes" INTEGER NOT NULL,
  "actual_size_bytes" INTEGER,
  "object_key" TEXT NOT NULL,
  "checksum_sha256" VARCHAR(64),
  "scan_provider" VARCHAR(80),
  "scan_result" VARCHAR(160),
  "scan_requested_at" TIMESTAMPTZ(6),
  "scanned_at" TIMESTAMPTZ(6),
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "upload_assets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "upload_assets_expected_size_check" CHECK ("expected_size_bytes" > 0),
  CONSTRAINT "upload_assets_actual_size_check" CHECK (
    "actual_size_bytes" IS NULL OR "actual_size_bytes" >= 0
  ),
  CONSTRAINT "upload_assets_checksum_check" CHECK (
    "checksum_sha256" IS NULL OR "checksum_sha256" ~ '^[a-f0-9]{64}$'
  )
);

CREATE UNIQUE INDEX "upload_assets_object_key_key"
  ON "upload_assets"("object_key");
CREATE INDEX "upload_assets_organization_id_workspace_id_status_created_at_idx"
  ON "upload_assets"("organization_id","workspace_id","status","created_at");
CREATE INDEX "upload_assets_session_id_status_created_at_idx"
  ON "upload_assets"("session_id","status","created_at");

ALTER TABLE "upload_assets"
  ADD CONSTRAINT "upload_assets_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "upload_assets"
  ADD CONSTRAINT "upload_assets_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "upload_assets"
  ADD CONSTRAINT "upload_assets_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "sessions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "upload_assets"
  ADD CONSTRAINT "upload_assets_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "upload_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "upload_assets" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_upload_assets" ON "upload_assets"
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
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE upload_assets TO sessions_api;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE upload_assets TO sessions_worker;
  END IF;
END $$;
