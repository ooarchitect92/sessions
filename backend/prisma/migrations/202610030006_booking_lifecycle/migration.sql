ALTER TABLE "booking_reservations"
  ADD COLUMN "management_token_hash" VARCHAR(64),
  ADD COLUMN "cancelled_at" TIMESTAMPTZ(6),
  ADD COLUMN "reschedule_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "booking_reservations"
  ADD CONSTRAINT "booking_reservations_reschedule_count_check"
    CHECK ("reschedule_count" >= 0),
  ADD CONSTRAINT "booking_reservations_version_check"
    CHECK ("version" > 0);

CREATE UNIQUE INDEX "booking_reservations_management_token_hash_key"
  ON "booking_reservations"("management_token_hash");

DROP INDEX IF EXISTS "booking_reservations_booking_page_id_starts_at_key";

CREATE UNIQUE INDEX "booking_reservations_confirmed_slot_key"
  ON "booking_reservations"("booking_page_id", "starts_at")
  WHERE "status" = 'CONFIRMED';
