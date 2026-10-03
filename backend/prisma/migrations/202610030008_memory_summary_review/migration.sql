ALTER TABLE "memory_summaries"
  ADD COLUMN "reviewed_at" TIMESTAMPTZ(6),
  ADD COLUMN "reviewed_by_user_id" UUID,
  ADD COLUMN "review_note" VARCHAR(1000);

CREATE TABLE "memory_summary_revisions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "memory_summary_id" UUID NOT NULL,
  "edited_by_user_id" UUID NOT NULL,
  "summary_version" INTEGER NOT NULL,
  "summary_text" TEXT NOT NULL,
  "decisions" JSONB NOT NULL DEFAULT '[]',
  "action_items" JSONB NOT NULL DEFAULT '[]',
  "review_note" VARCHAR(1000),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "memory_summary_revisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "memory_summary_revisions_version_check" CHECK ("summary_version" > 0),
  CONSTRAINT "memory_summary_revisions_memory_summary_id_fkey"
    FOREIGN KEY ("memory_summary_id") REFERENCES "memory_summaries"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "memory_summary_revisions_organization_id_workspace_id_memory_summary_id_created_at_idx"
  ON "memory_summary_revisions"("organization_id", "workspace_id", "memory_summary_id", "created_at");

CREATE INDEX "memory_summary_revisions_memory_summary_id_summary_version_idx"
  ON "memory_summary_revisions"("memory_summary_id", "summary_version");

ALTER TABLE "memory_summary_revisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memory_summary_revisions" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_memory_summary_revisions" ON "memory_summary_revisions"
  USING (
    "organization_id" = app.current_organization_id()
    AND "workspace_id" = app.current_workspace_id()
  )
  WITH CHECK (
    "organization_id" = app.current_organization_id()
    AND "workspace_id" = app.current_workspace_id()
  );
