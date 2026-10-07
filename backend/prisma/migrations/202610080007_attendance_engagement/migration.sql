CREATE TYPE "EngagementEventKind" AS ENUM (
  'CHAT_MESSAGE',
  'CHAT_REACTION',
  'POLL_RESPONSE',
  'QUESTION_SUBMITTED',
  'QUESTION_VOTE'
);

CREATE TABLE "attendance_intervals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "event_registration_id" UUID,
  "connection_id" VARCHAR(120) NOT NULL,
  "joined_at" TIMESTAMPTZ(6) NOT NULL,
  "left_at" TIMESTAMPTZ(6),
  "last_seen_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attendance_intervals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "attendance_intervals_time_check" CHECK ("left_at" IS NULL OR "left_at" >= "joined_at")
);

CREATE TABLE "engagement_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "kind" "EngagementEventKind" NOT NULL,
  "reference_type" VARCHAR(80),
  "reference_id" UUID,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "engagement_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "attendance_intervals_session_id_connection_id_key"
  ON "attendance_intervals"("session_id","connection_id");
CREATE INDEX "attendance_intervals_organization_id_workspace_id_session_id_idx"
  ON "attendance_intervals"("organization_id","workspace_id","session_id");
CREATE INDEX "attendance_intervals_session_id_user_id_joined_at_idx"
  ON "attendance_intervals"("session_id","user_id","joined_at");
CREATE INDEX "attendance_intervals_event_registration_id_joined_at_idx"
  ON "attendance_intervals"("event_registration_id","joined_at");

CREATE INDEX "engagement_events_organization_id_workspace_id_session_id_occurred_at_idx"
  ON "engagement_events"("organization_id","workspace_id","session_id","occurred_at");
CREATE INDEX "engagement_events_session_id_user_id_occurred_at_idx"
  ON "engagement_events"("session_id","user_id","occurred_at");
CREATE INDEX "engagement_events_session_id_kind_occurred_at_idx"
  ON "engagement_events"("session_id","kind","occurred_at");

ALTER TABLE "attendance_intervals"
  ADD CONSTRAINT "attendance_intervals_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_intervals"
  ADD CONSTRAINT "attendance_intervals_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_intervals"
  ADD CONSTRAINT "attendance_intervals_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "sessions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_intervals"
  ADD CONSTRAINT "attendance_intervals_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_intervals"
  ADD CONSTRAINT "attendance_intervals_event_registration_id_fkey"
  FOREIGN KEY ("event_registration_id") REFERENCES "event_registrations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "engagement_events"
  ADD CONSTRAINT "engagement_events_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "engagement_events"
  ADD CONSTRAINT "engagement_events_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "engagement_events"
  ADD CONSTRAINT "engagement_events_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "sessions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "engagement_events"
  ADD CONSTRAINT "engagement_events_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attendance_intervals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendance_intervals" FORCE ROW LEVEL SECURITY;
ALTER TABLE "engagement_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "engagement_events" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_attendance_intervals"
  ON "attendance_intervals"
  USING (
    organization_id = app.current_organization_id()
    AND workspace_id = app.current_workspace_id()
  )
  WITH CHECK (
    organization_id = app.current_organization_id()
    AND workspace_id = app.current_workspace_id()
  );

CREATE POLICY "tenant_isolation_engagement_events"
  ON "engagement_events"
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
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE attendance_intervals TO sessions_api;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE engagement_events TO sessions_api;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE attendance_intervals TO sessions_worker;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE engagement_events TO sessions_worker;
  END IF;
END $$;
