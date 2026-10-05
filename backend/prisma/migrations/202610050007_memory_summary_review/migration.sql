ALTER TABLE "memory_summaries"
  ADD COLUMN "reviewed_at" TIMESTAMPTZ(6),
  ADD COLUMN "reviewed_by_user_id" UUID;

ALTER TABLE "memory_summaries"
  ADD CONSTRAINT "memory_summaries_reviewed_by_user_id_fkey"
  FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "memory_summaries_reviewed_by_user_id_idx"
  ON "memory_summaries"("reviewed_by_user_id");
