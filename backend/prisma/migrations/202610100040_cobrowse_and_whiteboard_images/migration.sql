ALTER TABLE "whiteboard_operations"
  DROP CONSTRAINT IF EXISTS "whiteboard_operations_kind_check";

ALTER TABLE "whiteboard_operations"
  ADD CONSTRAINT "whiteboard_operations_kind_check" CHECK (
    "kind" IN (
      'STROKE_ADD',
      'SHAPE_ADD',
      'NOTE_ADD',
      'TEXT_ADD',
      'IMAGE_ADD',
      'OBJECT_REMOVE',
      'CLEAR'
    )
  );

ALTER TYPE "AgendaItemType" ADD VALUE IF NOT EXISTS 'COBROWSE';

CREATE TABLE "cobrowse_states" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "url" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT false,
  "controller_user_id" UUID,
  "started_by_id" UUID,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cobrowse_states_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cobrowse_states_version_check" CHECK ("version" > 0)
);

CREATE UNIQUE INDEX "cobrowse_states_session_id_key"
  ON "cobrowse_states"("session_id");
CREATE INDEX "cobrowse_states_organization_id_workspace_id_session_id_idx"
  ON "cobrowse_states"("organization_id", "workspace_id", "session_id");

ALTER TABLE "cobrowse_states"
  ADD CONSTRAINT "cobrowse_states_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cobrowse_states"
  ADD CONSTRAINT "cobrowse_states_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cobrowse_states"
  ADD CONSTRAINT "cobrowse_states_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "sessions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cobrowse_states"
  ADD CONSTRAINT "cobrowse_states_controller_user_id_fkey"
  FOREIGN KEY ("controller_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cobrowse_states"
  ADD CONSTRAINT "cobrowse_states_started_by_id_fkey"
  FOREIGN KEY ("started_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "cobrowse_states" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cobrowse_states" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_cobrowse_states" ON "cobrowse_states"
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
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE cobrowse_states TO sessions_api;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE cobrowse_states TO sessions_worker;
  END IF;
END $$;
