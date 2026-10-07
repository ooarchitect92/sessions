ALTER TABLE "booking_reservations"
  ADD COLUMN "management_token_hash" VARCHAR(64),
  ADD COLUMN "cancellation_reason" VARCHAR(500),
  ADD COLUMN "cancelled_at" TIMESTAMPTZ(6),
  ADD COLUMN "rescheduled_at" TIMESTAMPTZ(6),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

UPDATE "booking_reservations"
SET "management_token_hash" =
  md5(gen_random_uuid()::text || ':' || "id"::text || ':a') ||
  md5(gen_random_uuid()::text || ':' || "id"::text || ':b')
WHERE "management_token_hash" IS NULL;

ALTER TABLE "booking_reservations"
  ALTER COLUMN "management_token_hash" SET NOT NULL;

ALTER TABLE "booking_reservations"
  ADD CONSTRAINT "booking_reservations_management_token_hash_check"
  CHECK ("management_token_hash" ~ '^[a-f0-9]{64}$');

CREATE INDEX "booking_reservations_management_token_hash_idx"
  ON "booking_reservations"("management_token_hash");
