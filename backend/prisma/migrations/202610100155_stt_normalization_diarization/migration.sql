ALTER TABLE "transcripts"
  ADD COLUMN "normalized" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "normalized_mime_type" VARCHAR(160),
  ADD COLUMN "diarized" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "speaker_count" INTEGER,
  ADD COLUMN "quality_metadata" JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX "transcripts_quality_idx"
  ON "transcripts"("organization_id", "workspace_id", "diarized", "normalized");
