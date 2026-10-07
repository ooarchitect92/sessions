CREATE TYPE "BreakoutStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');

CREATE TABLE "breakout_rooms" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "position" INTEGER NOT NULL,
  "livekit_room_name" VARCHAR(220) NOT NULL,
  "status" "BreakoutStatus" NOT NULL DEFAULT 'DRAFT',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "breakout_rooms_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "breakout_rooms_position_check" CHECK ("position" >= 0)
);

CREATE TABLE "breakout_assignments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "breakout_room_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "breakout_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "breakout_announcements" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "author_user_id" UUID NOT NULL,
  "body" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "breakout_announcements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "breakout_announcements_body_check" CHECK (char_length("body") BETWEEN 1 AND 2000)
);

CREATE UNIQUE INDEX "breakout_rooms_livekit_room_name_key"
  ON "breakout_rooms"("livekit_room_name");
CREATE UNIQUE INDEX "breakout_rooms_session_id_position_key"
  ON "breakout_rooms"("session_id", "position");
CREATE INDEX "breakout_rooms_organization_id_workspace_id_session_id_status_idx"
  ON "breakout_rooms"("organization_id", "workspace_id", "session_id", "status");

CREATE UNIQUE INDEX "breakout_assignments_session_id_user_id_key"
  ON "breakout_assignments"("session_id", "user_id");
CREATE INDEX "breakout_assignments_organization_id_workspace_id_session_id_breakout_room_id_idx"
  ON "breakout_assignments"("organization_id", "workspace_id", "session_id", "breakout_room_id");

CREATE INDEX "breakout_announcements_organization_id_workspace_id_session_id_created_at_idx"
  ON "breakout_announcements"("organization_id", "workspace_id", "session_id", "created_at");

ALTER TABLE "breakout_rooms"
  ADD CONSTRAINT "breakout_rooms_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "breakout_rooms"
  ADD CONSTRAINT "breakout_rooms_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "breakout_rooms"
  ADD CONSTRAINT "breakout_rooms_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "sessions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "breakout_assignments"
  ADD CONSTRAINT "breakout_assignments_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "breakout_assignments"
  ADD CONSTRAINT "breakout_assignments_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "breakout_assignments"
  ADD CONSTRAINT "breakout_assignments_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "sessions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "breakout_assignments"
  ADD CONSTRAINT "breakout_assignments_breakout_room_id_fkey"
  FOREIGN KEY ("breakout_room_id") REFERENCES "breakout_rooms"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "breakout_assignments"
  ADD CONSTRAINT "breakout_assignments_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "breakout_announcements"
  ADD CONSTRAINT "breakout_announcements_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "breakout_announcements"
  ADD CONSTRAINT "breakout_announcements_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "breakout_announcements"
  ADD CONSTRAINT "breakout_announcements_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "sessions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "breakout_announcements"
  ADD CONSTRAINT "breakout_announcements_author_user_id_fkey"
  FOREIGN KEY ("author_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "breakout_rooms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "breakout_rooms" FORCE ROW LEVEL SECURITY;
ALTER TABLE "breakout_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "breakout_assignments" FORCE ROW LEVEL SECURITY;
ALTER TABLE "breakout_announcements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "breakout_announcements" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_breakout_rooms" ON "breakout_rooms"
  USING (
    organization_id = app.current_organization_id()
    AND workspace_id = app.current_workspace_id()
  )
  WITH CHECK (
    organization_id = app.current_organization_id()
    AND workspace_id = app.current_workspace_id()
  );

CREATE POLICY "tenant_isolation_breakout_assignments" ON "breakout_assignments"
  USING (
    organization_id = app.current_organization_id()
    AND workspace_id = app.current_workspace_id()
  )
  WITH CHECK (
    organization_id = app.current_organization_id()
    AND workspace_id = app.current_workspace_id()
  );

CREATE POLICY "tenant_isolation_breakout_announcements" ON "breakout_announcements"
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
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
      breakout_rooms, breakout_assignments, breakout_announcements
    TO sessions_api;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
      breakout_rooms, breakout_assignments, breakout_announcements
    TO sessions_worker;
  END IF;
END $$;
