CREATE TABLE "session_attendance_intervals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "joined_at" TIMESTAMPTZ(6) NOT NULL,
  "left_at" TIMESTAMPTZ(6),
  "last_heartbeat_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "session_attendance_intervals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "session_attendance_intervals_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "sessions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "session_attendance_intervals_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "session_attendance_intervals_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "session_attendance_intervals_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "session_attendance_intervals_range_check"
    CHECK ("left_at" IS NULL OR "left_at" >= "joined_at")
);

CREATE INDEX "session_attendance_intervals_organization_id_workspace_id_session_id_joined_at_idx"
  ON "session_attendance_intervals"("organization_id", "workspace_id", "session_id", "joined_at");

CREATE INDEX "session_attendance_intervals_session_id_user_id_joined_at_idx"
  ON "session_attendance_intervals"("session_id", "user_id", "joined_at");

CREATE INDEX "session_attendance_intervals_workspace_id_joined_at_idx"
  ON "session_attendance_intervals"("workspace_id", "joined_at");

CREATE UNIQUE INDEX "session_attendance_intervals_one_open_per_user_idx"
  ON "session_attendance_intervals"("session_id", "user_id")
  WHERE "left_at" IS NULL;

ALTER TABLE "session_attendance_intervals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "session_attendance_intervals" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_session_attendance_intervals"
  ON "session_attendance_intervals"
  USING (
    "organization_id" = app.current_organization_id()
    AND "workspace_id" = app.current_workspace_id()
  )
  WITH CHECK (
    "organization_id" = app.current_organization_id()
    AND "workspace_id" = app.current_workspace_id()
  );
