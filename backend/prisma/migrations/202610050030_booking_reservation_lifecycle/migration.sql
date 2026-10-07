ALTER TABLE "booking_reservations"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "rescheduled_at" TIMESTAMPTZ(6),
  ADD COLUMN "cancelled_at" TIMESTAMPTZ(6);

CREATE INDEX "booking_reservations_booking_page_id_status_starts_at_version_idx"
  ON "booking_reservations"("booking_page_id", "status", "starts_at", "version");
