CREATE TYPE "CalendarSyncAction" AS ENUM ('CREATE', 'UPDATE', 'CANCEL');
CREATE TYPE "CalendarSyncStatus" AS ENUM ('PENDING', 'PROCESSING', 'SYNCED', 'FAILED');

CREATE TABLE "calendar_event_syncs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "reservation_id" UUID NOT NULL,
  "connection_id" UUID NOT NULL,
  "provider" "CalendarProvider" NOT NULL,
  "provider_event_id" VARCHAR(512),
  "action" "CalendarSyncAction" NOT NULL DEFAULT 'CREATE',
  "status" "CalendarSyncStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMPTZ(6),
  "last_attempt_at" TIMESTAMPTZ(6),
  "synced_at" TIMESTAMPTZ(6),
  "failure_code" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "calendar_event_syncs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "calendar_event_syncs"
  ADD CONSTRAINT "calendar_event_syncs_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calendar_event_syncs"
  ADD CONSTRAINT "calendar_event_syncs_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calendar_event_syncs"
  ADD CONSTRAINT "calendar_event_syncs_reservation_id_fkey"
  FOREIGN KEY ("reservation_id") REFERENCES "booking_reservations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calendar_event_syncs"
  ADD CONSTRAINT "calendar_event_syncs_connection_id_fkey"
  FOREIGN KEY ("connection_id") REFERENCES "calendar_connections"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "calendar_event_syncs_reservation_id_connection_id_key"
  ON "calendar_event_syncs"("reservation_id", "connection_id");
CREATE INDEX "calendar_event_syncs_organization_id_workspace_id_status_next_attempt_at_idx"
  ON "calendar_event_syncs"("organization_id", "workspace_id", "status", "next_attempt_at");
CREATE INDEX "calendar_event_syncs_connection_id_status_idx"
  ON "calendar_event_syncs"("connection_id", "status");

ALTER TABLE "calendar_event_syncs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "calendar_event_syncs" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_calendar_event_syncs"
  ON "calendar_event_syncs"
  USING (
    "organization_id" = app.current_organization_id()
    AND "workspace_id" = app.current_workspace_id()
  )
  WITH CHECK (
    "organization_id" = app.current_organization_id()
    AND "workspace_id" = app.current_workspace_id()
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_api') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "calendar_event_syncs" TO sessions_api;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "calendar_event_syncs" TO sessions_worker;
  END IF;
END $$;
