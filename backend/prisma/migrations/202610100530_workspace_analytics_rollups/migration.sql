CREATE TABLE "workspace_analytics_daily" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "date" DATE NOT NULL,
  "sessions_scheduled" INTEGER NOT NULL DEFAULT 0,
  "unique_attendees" INTEGER NOT NULL DEFAULT 0,
  "attendance_seconds" BIGINT NOT NULL DEFAULT 0,
  "engagement_events" INTEGER NOT NULL DEFAULT 0,
  "events_scheduled" INTEGER NOT NULL DEFAULT 0,
  "registrations_created" INTEGER NOT NULL DEFAULT 0,
  "booking_reservations_created" INTEGER NOT NULL DEFAULT 0,
  "computed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspace_analytics_daily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_analytics_daily_workspace_date_key"
  ON "workspace_analytics_daily"("workspace_id", "date");
CREATE INDEX "workspace_analytics_daily_org_workspace_date_idx"
  ON "workspace_analytics_daily"("organization_id", "workspace_id", "date");

ALTER TABLE "workspace_analytics_daily"
  ADD CONSTRAINT "workspace_analytics_daily_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_analytics_daily"
  ADD CONSTRAINT "workspace_analytics_daily_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workspace_analytics_daily" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_analytics_daily" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_workspace_analytics_daily"
  ON "workspace_analytics_daily"
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
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE workspace_analytics_daily TO sessions_api;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE workspace_analytics_daily TO sessions_worker;
  END IF;
END $$;
