ALTER TABLE "email_deliveries"
  ADD COLUMN "booking_reservation_id" UUID,
  ADD COLUMN "event_registration_id" UUID,
  ADD COLUMN "purpose" VARCHAR(80) NOT NULL DEFAULT 'FOLLOW_UP',
  ADD COLUMN "scheduled_for" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "email_deliveries"
  ADD CONSTRAINT "email_deliveries_booking_reservation_id_fkey"
  FOREIGN KEY ("booking_reservation_id") REFERENCES "booking_reservations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "email_deliveries"
  ADD CONSTRAINT "email_deliveries_event_registration_id_fkey"
  FOREIGN KEY ("event_registration_id") REFERENCES "event_registrations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX IF EXISTS "email_deliveries_organization_id_workspace_id_status_created_at_idx";

CREATE INDEX "email_deliveries_organization_id_workspace_id_status_scheduled_for_idx"
  ON "email_deliveries"("organization_id", "workspace_id", "status", "scheduled_for");
CREATE INDEX "email_deliveries_booking_reservation_id_purpose_scheduled_for_idx"
  ON "email_deliveries"("booking_reservation_id", "purpose", "scheduled_for");
CREATE INDEX "email_deliveries_event_registration_id_purpose_scheduled_for_idx"
  ON "email_deliveries"("event_registration_id", "purpose", "scheduled_for");
