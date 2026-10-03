CREATE TABLE "transcript_revisions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "transcript_id" UUID NOT NULL,
  "edited_by_user_id" UUID NOT NULL,
  "transcript_version" INTEGER NOT NULL,
  "full_text" TEXT NOT NULL,
  "segments" JSONB NOT NULL,
  "reason" VARCHAR(1000),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "transcript_revisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "transcript_revisions_version_check" CHECK ("transcript_version" > 0),
  CONSTRAINT "transcript_revisions_transcript_id_fkey"
    FOREIGN KEY ("transcript_id") REFERENCES "transcripts"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "transcript_revisions_organization_id_workspace_id_transcript_id_created_at_idx"
  ON "transcript_revisions"("organization_id", "workspace_id", "transcript_id", "created_at");

CREATE INDEX "transcript_revisions_transcript_id_transcript_version_idx"
  ON "transcript_revisions"("transcript_id", "transcript_version");

ALTER TABLE "transcript_revisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transcript_revisions" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_transcript_revisions" ON "transcript_revisions"
  USING (
    "organization_id" = app.current_organization_id()
    AND "workspace_id" = app.current_workspace_id()
  )
  WITH CHECK (
    "organization_id" = app.current_organization_id()
    AND "workspace_id" = app.current_workspace_id()
  );
