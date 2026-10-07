CREATE TABLE "whiteboards" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "snapshot" JSONB NOT NULL DEFAULT '{"objects":{}}',
  "snapshot_sequence" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "whiteboards_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "whiteboards_sequence_check" CHECK (
    "snapshot_sequence" >= 0
    AND "version" >= "snapshot_sequence"
  )
);

CREATE TABLE "whiteboard_operations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "whiteboard_id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "client_operation_id" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "kind" VARCHAR(40) NOT NULL,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "whiteboard_operations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "whiteboard_operations_sequence_check" CHECK ("sequence" > 0),
  CONSTRAINT "whiteboard_operations_kind_check" CHECK (
    "kind" IN (
      'STROKE_ADD',
      'SHAPE_ADD',
      'NOTE_ADD',
      'TEXT_ADD',
      'OBJECT_REMOVE',
      'CLEAR'
    )
  )
);

CREATE UNIQUE INDEX "whiteboards_session_id_key"
  ON "whiteboards"("session_id");
CREATE INDEX "whiteboards_organization_id_workspace_id_session_id_idx"
  ON "whiteboards"("organization_id", "workspace_id", "session_id");

CREATE UNIQUE INDEX "whiteboard_operations_client_operation_id_key"
  ON "whiteboard_operations"("client_operation_id");
CREATE UNIQUE INDEX "whiteboard_operations_whiteboard_id_sequence_key"
  ON "whiteboard_operations"("whiteboard_id", "sequence");
CREATE INDEX "whiteboard_operations_organization_id_workspace_id_session_id_sequence_idx"
  ON "whiteboard_operations"(
    "organization_id",
    "workspace_id",
    "session_id",
    "sequence"
  );

ALTER TABLE "whiteboards"
  ADD CONSTRAINT "whiteboards_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whiteboards"
  ADD CONSTRAINT "whiteboards_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whiteboards"
  ADD CONSTRAINT "whiteboards_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "sessions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "whiteboard_operations"
  ADD CONSTRAINT "whiteboard_operations_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whiteboard_operations"
  ADD CONSTRAINT "whiteboard_operations_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whiteboard_operations"
  ADD CONSTRAINT "whiteboard_operations_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "sessions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whiteboard_operations"
  ADD CONSTRAINT "whiteboard_operations_whiteboard_id_fkey"
  FOREIGN KEY ("whiteboard_id") REFERENCES "whiteboards"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whiteboard_operations"
  ADD CONSTRAINT "whiteboard_operations_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "whiteboards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whiteboards" FORCE ROW LEVEL SECURITY;
ALTER TABLE "whiteboard_operations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whiteboard_operations" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_whiteboards" ON "whiteboards"
  USING (
    organization_id = app.current_organization_id()
    AND workspace_id = app.current_workspace_id()
  )
  WITH CHECK (
    organization_id = app.current_organization_id()
    AND workspace_id = app.current_workspace_id()
  );

CREATE POLICY "tenant_isolation_whiteboard_operations" ON "whiteboard_operations"
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
      whiteboards, whiteboard_operations
    TO sessions_api;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
      whiteboards, whiteboard_operations
    TO sessions_worker;
  END IF;
END $$;
