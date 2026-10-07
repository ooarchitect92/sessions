CREATE TYPE "EventPresenterRole" AS ENUM ('ORGANIZER', 'HOST', 'CO_HOST', 'SPEAKER');

CREATE TABLE "event_presenters" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "user_id" UUID,
  "role" "EventPresenterRole" NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "email" CITEXT NOT NULL,
  "title" VARCHAR(160),
  "bio" TEXT,
  "avatar_url" TEXT,
  "position" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "event_presenters_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "event_presenters"
  ADD CONSTRAINT "event_presenters_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_presenters"
  ADD CONSTRAINT "event_presenters_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_presenters"
  ADD CONSTRAINT "event_presenters_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_presenters"
  ADD CONSTRAINT "event_presenters_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "event_presenters_event_id_email_key"
  ON "event_presenters"("event_id", "email");
CREATE INDEX "event_presenters_organization_id_workspace_id_event_id_idx"
  ON "event_presenters"("organization_id", "workspace_id", "event_id");
CREATE INDEX "event_presenters_event_id_role_position_idx"
  ON "event_presenters"("event_id", "role", "position");
CREATE INDEX "event_presenters_user_id_event_id_idx"
  ON "event_presenters"("user_id", "event_id");

ALTER TABLE "event_presenters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "event_presenters" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_event_presenters"
  ON "event_presenters"
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
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "event_presenters" TO sessions_api;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "event_presenters" TO sessions_worker;
  END IF;
END $$;
