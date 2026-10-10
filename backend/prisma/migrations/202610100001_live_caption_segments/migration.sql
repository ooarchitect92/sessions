CREATE TABLE "live_caption_segments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "start_ms" INTEGER,
  "end_ms" INTEGER,
  "speaker_label" VARCHAR(160),
  "language" VARCHAR(32),
  "text" TEXT NOT NULL,
  "source" VARCHAR(80) NOT NULL DEFAULT 'host_bridge',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "live_caption_segments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "live_caption_segments_session_id_sequence_key"
  ON "live_caption_segments"("session_id", "sequence");
CREATE INDEX "live_caption_segments_org_workspace_session_sequence_idx"
  ON "live_caption_segments"("organization_id", "workspace_id", "session_id", "sequence");

ALTER TABLE "live_caption_segments"
  ADD CONSTRAINT "live_caption_segments_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "live_caption_segments"
  ADD CONSTRAINT "live_caption_segments_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "live_caption_segments"
  ADD CONSTRAINT "live_caption_segments_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "sessions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "live_caption_segments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "live_caption_segments" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_live_caption_segments"
  ON "live_caption_segments"
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
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE live_caption_segments TO sessions_api;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE live_caption_segments TO sessions_worker;
  END IF;
END $$;
