CREATE TYPE "RecordingConsentDecision" AS ENUM ('GRANTED', 'DECLINED', 'REVOKED');

ALTER TABLE "recordings"
  ADD COLUMN "mime_type" VARCHAR(160),
  ADD COLUMN "size_bytes" VARCHAR(32),
  ADD COLUMN "retention_until" TIMESTAMPTZ(6),
  ADD COLUMN "stop_requested_at" TIMESTAMPTZ(6),
  ADD COLUMN "deletion_requested_at" TIMESTAMPTZ(6),
  ADD COLUMN "deleted_at" TIMESTAMPTZ(6);

ALTER TABLE "recordings"
  ADD CONSTRAINT "recordings_size_bytes_check"
  CHECK ("size_bytes" IS NULL OR "size_bytes" ~ '^[0-9]+$');

CREATE INDEX "recordings_status_retention_until_idx"
  ON "recordings"("status", "retention_until");

CREATE TABLE "recording_consents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "decision" "RecordingConsentDecision" NOT NULL,
  "policy_version" VARCHAR(64) NOT NULL,
  "notice_version" VARCHAR(64) NOT NULL,
  "granted_at" TIMESTAMPTZ(6),
  "revoked_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recording_consents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "recording_consents_decision_timestamps_check" CHECK (
    ("decision" = 'GRANTED' AND "granted_at" IS NOT NULL AND "revoked_at" IS NULL)
    OR ("decision" = 'DECLINED' AND "granted_at" IS NULL AND "revoked_at" IS NULL)
    OR ("decision" = 'REVOKED' AND "revoked_at" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "recording_consents_session_id_user_id_key"
  ON "recording_consents"("session_id", "user_id");
CREATE INDEX "recording_consents_organization_id_workspace_id_session_id_decision_idx"
  ON "recording_consents"("organization_id", "workspace_id", "session_id", "decision");
CREATE INDEX "recording_consents_user_id_updated_at_idx"
  ON "recording_consents"("user_id", "updated_at");

ALTER TABLE "recording_consents"
  ADD CONSTRAINT "recording_consents_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recording_consents"
  ADD CONSTRAINT "recording_consents_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recording_consents"
  ADD CONSTRAINT "recording_consents_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "sessions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recording_consents"
  ADD CONSTRAINT "recording_consents_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recording_consents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "recording_consents" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_recording_consents"
  ON "recording_consents"
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
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "recording_consents" TO sessions_api;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "recording_consents" TO sessions_worker;
  END IF;
END $$;
