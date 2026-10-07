ALTER TABLE "event_registrations"
  ADD COLUMN "admission_token_hash" VARCHAR(64),
  ADD COLUMN "admission_token_expires_at" TIMESTAMPTZ(6);

CREATE INDEX "event_registrations_admission_token_expires_at_idx"
  ON "event_registrations"("admission_token_expires_at");
