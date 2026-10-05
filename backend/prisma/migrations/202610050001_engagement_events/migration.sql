CREATE TABLE "engagement_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "actor_user_id" UUID,
  "event_type" VARCHAR(100) NOT NULL,
  "source_type" VARCHAR(80),
  "source_id" UUID,
  "properties" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "engagement_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "engagement_events_organization_id_workspace_id_occurred_at_idx"
  ON "engagement_events"("organization_id", "workspace_id", "occurred_at");

CREATE INDEX "engagement_events_workspace_id_event_type_occurred_at_idx"
  ON "engagement_events"("workspace_id", "event_type", "occurred_at");

CREATE INDEX "engagement_events_session_id_occurred_at_idx"
  ON "engagement_events"("session_id", "occurred_at");

CREATE INDEX "engagement_events_session_id_event_type_occurred_at_idx"
  ON "engagement_events"("session_id", "event_type", "occurred_at");

CREATE INDEX "engagement_events_actor_user_id_occurred_at_idx"
  ON "engagement_events"("actor_user_id", "occurred_at");

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
  ADD CONSTRAINT "engagement_events_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "engagement_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "engagement_events" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_engagement_events"
  ON "engagement_events"
  USING (
    "organization_id" = app.current_organization_id()
    AND "workspace_id" = app.current_workspace_id()
  )
  WITH CHECK (
    "organization_id" = app.current_organization_id()
    AND "workspace_id" = app.current_workspace_id()
  );
