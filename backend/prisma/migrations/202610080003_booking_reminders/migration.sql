CREATE TYPE "NotificationKind" AS ENUM (
  'BOOKING_REMINDER_24H',
  'BOOKING_REMINDER_1H'
);

CREATE TYPE "NotificationStatus" AS ENUM (
  'PENDING',
  'SENDING',
  'DELIVERED',
  'FAILED',
  'DEAD_LETTER',
  'CANCELLED'
);

CREATE TABLE "notification_deliveries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "booking_reservation_id" UUID NOT NULL,
  "kind" "NotificationKind" NOT NULL,
  "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
  "recipient_email" CITEXT NOT NULL,
  "scheduled_for" TIMESTAMPTZ(6) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMPTZ(6),
  "provider" VARCHAR(80),
  "provider_message_id" VARCHAR(255),
  "last_error" VARCHAR(500),
  "delivered_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_deliveries_attempts_check" CHECK ("attempts" >= 0)
);

CREATE UNIQUE INDEX "notification_deliveries_booking_reservation_id_kind_scheduled_for_key"
  ON "notification_deliveries"("booking_reservation_id","kind","scheduled_for");
CREATE INDEX "notification_deliveries_status_next_attempt_at_scheduled_for_idx"
  ON "notification_deliveries"("status","next_attempt_at","scheduled_for");
CREATE INDEX "notification_deliveries_organization_id_workspace_id_created_at_idx"
  ON "notification_deliveries"("organization_id","workspace_id","created_at");

ALTER TABLE "notification_deliveries"
  ADD CONSTRAINT "notification_deliveries_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_deliveries"
  ADD CONSTRAINT "notification_deliveries_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_deliveries"
  ADD CONSTRAINT "notification_deliveries_booking_reservation_id_fkey"
  FOREIGN KEY ("booking_reservation_id") REFERENCES "booking_reservations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_deliveries" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_notification_deliveries"
  ON "notification_deliveries"
  USING (
    organization_id = app.current_organization_id()
    AND workspace_id = app.current_workspace_id()
  )
  WITH CHECK (
    organization_id = app.current_organization_id()
    AND workspace_id = app.current_workspace_id()
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_api') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE notification_deliveries TO sessions_api;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE notification_deliveries TO sessions_worker;
  END IF;
END $$;
