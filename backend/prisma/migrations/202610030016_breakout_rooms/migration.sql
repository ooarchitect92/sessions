CREATE TYPE "BreakoutRoomStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED');

CREATE TABLE "breakout_rooms" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "position" INTEGER NOT NULL,
  "status" "BreakoutRoomStatus" NOT NULL DEFAULT 'DRAFT',
  "livekit_room_name" VARCHAR(220) NOT NULL,
  "opened_at" TIMESTAMPTZ(6),
  "closed_at" TIMESTAMPTZ(6),
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
  "joined_at" TIMESTAMPTZ(6),
  "left_at" TIMESTAMPTZ(6),
  CONSTRAINT "breakout_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "breakout_assignments_range_check"
    CHECK ("left_at" IS NULL OR "joined_at" IS NULL OR "left_at" >= "joined_at")
);

CREATE UNIQUE INDEX "breakout_rooms_livekit_room_name_key"
  ON "breakout_rooms"("livekit_room_name");
CREATE UNIQUE INDEX "breakout_rooms_session_id_position_key"
  ON "breakout_rooms"("session_id", "position");
CREATE UNIQUE INDEX "breakout_rooms_session_id_name_key"
  ON "breakout_rooms"("session_id", "name");
CREATE INDEX "breakout_rooms_organization_id_workspace_id_session_id_status_idx"
  ON "breakout_rooms"("organization_id", "workspace_id", "session_id", "status");

CREATE UNIQUE INDEX "breakout_assignments_session_id_user_id_key"
  ON "breakout_assignments"("session_id", "user_id");
CREATE INDEX "breakout_assignments_organization_id_workspace_id_session_id_idx"
  ON "breakout_assignments"("organization_id", "workspace_id", "session_id");
CREATE INDEX "breakout_assignments_breakout_room_id_assigned_at_idx"
  ON "breakout_assignments"("breakout_room_id", "assigned_at");

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

ALTER TABLE "breakout_rooms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "breakout_rooms" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_breakout_rooms"
  ON "breakout_rooms"
  USING (
    "organization_id" = app.current_organization_id()
    AND "workspace_id" = app.current_workspace_id()
  )
  WITH CHECK (
    "organization_id" = app.current_organization_id()
    AND "workspace_id" = app.current_workspace_id()
  );

ALTER TABLE "breakout_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "breakout_assignments" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_breakout_assignments"
  ON "breakout_assignments"
  USING (
    "organization_id" = app.current_organization_id()
    AND "workspace_id" = app.current_workspace_id()
  )
  WITH CHECK (
    "organization_id" = app.current_organization_id()
    AND "workspace_id" = app.current_workspace_id()
  );
