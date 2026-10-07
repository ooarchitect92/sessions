ALTER TABLE "booking_reservations"
  ADD COLUMN "manage_token_hash" VARCHAR(64),
  ADD COLUMN "manage_token_expires_at" TIMESTAMPTZ(6);

CREATE INDEX "booking_reservations_manage_token_expires_at_idx"
  ON "booking_reservations"("manage_token_expires_at");
