ALTER TABLE "memory_summaries"
  ADD COLUMN "follow_up_draft" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN "follow_up_generated_at" TIMESTAMPTZ(6),
  ADD COLUMN "follow_up_approved_at" TIMESTAMPTZ(6),
  ADD COLUMN "follow_up_approved_by_user_id" UUID;

ALTER TABLE "memory_summaries"
  ADD CONSTRAINT "memory_summaries_follow_up_approved_by_user_id_fkey"
  FOREIGN KEY ("follow_up_approved_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "memory_summaries_follow_up_approved_by_user_id_idx"
  ON "memory_summaries"("follow_up_approved_by_user_id");
