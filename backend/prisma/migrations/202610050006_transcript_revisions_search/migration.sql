CREATE TABLE "transcript_revisions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "transcript_id" UUID NOT NULL,
  "segment_id" UUID NOT NULL,
  "edited_by_user_id" UUID NOT NULL,
  "before" JSONB NOT NULL,
  "after" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "transcript_revisions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "transcript_revisions"
  ADD CONSTRAINT "transcript_revisions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "transcript_revisions"
  ADD CONSTRAINT "transcript_revisions_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "transcript_revisions"
  ADD CONSTRAINT "transcript_revisions_transcript_id_fkey"
  FOREIGN KEY ("transcript_id") REFERENCES "transcripts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "transcript_revisions"
  ADD CONSTRAINT "transcript_revisions_segment_id_fkey"
  FOREIGN KEY ("segment_id") REFERENCES "transcript_segments"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "transcript_revisions"
  ADD CONSTRAINT "transcript_revisions_edited_by_user_id_fkey"
  FOREIGN KEY ("edited_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "transcript_revisions_organization_id_workspace_id_transcript_id_created_at_idx"
  ON "transcript_revisions"("organization_id", "workspace_id", "transcript_id", "created_at");

CREATE INDEX "transcripts_full_text_fts_idx"
  ON "transcripts"
  USING GIN (to_tsvector('simple', coalesce("full_text", '')));

ALTER TABLE "transcript_revisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transcript_revisions" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_transcript_revisions"
  ON "transcript_revisions"
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
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "transcript_revisions" TO sessions_api;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "transcript_revisions" TO sessions_worker;
  END IF;
END $$;
