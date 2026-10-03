CREATE TABLE "whiteboard_documents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "snapshot" JSONB NOT NULL DEFAULT '{"elements":[]}'::jsonb,
  "snapshot_version" INTEGER NOT NULL DEFAULT 1,
  "compacted_through" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "whiteboard_documents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "whiteboard_documents_snapshot_version_check" CHECK ("snapshot_version" >= 1),
  CONSTRAINT "whiteboard_documents_compacted_through_check" CHECK ("compacted_through" >= 0)
);

CREATE TABLE "whiteboard_operations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "whiteboard_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "operation_id" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "type" VARCHAR(32) NOT NULL,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "whiteboard_operations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "whiteboard_operations_sequence_check" CHECK ("sequence" > 0),
  CONSTRAINT "whiteboard_operations_type_check"
    CHECK ("type" IN ('UPSERT_ELEMENT', 'DELETE_ELEMENT', 'CLEAR'))
);

CREATE UNIQUE INDEX "whiteboard_documents_session_id_key"
  ON "whiteboard_documents"("session_id");
CREATE INDEX "whiteboard_documents_organization_id_workspace_id_session_id_idx"
  ON "whiteboard_documents"("organization_id", "workspace_id", "session_id");

CREATE UNIQUE INDEX "whiteboard_operations_operation_id_key"
  ON "whiteboard_operations"("operation_id");
CREATE UNIQUE INDEX "whiteboard_operations_whiteboard_id_sequence_key"
  ON "whiteboard_operations"("whiteboard_id", "sequence");
CREATE INDEX "whiteboard_operations_organization_id_workspace_id_session_id_sequence_idx"
  ON "whiteboard_operations"("organization_id", "workspace_id", "session_id", "sequence");
CREATE INDEX "whiteboard_operations_whiteboard_id_sequence_idx"
  ON "whiteboard_operations"("whiteboard_id", "sequence");

ALTER TABLE "whiteboard_documents"
  ADD CONSTRAINT "whiteboard_documents_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whiteboard_documents"
  ADD CONSTRAINT "whiteboard_documents_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whiteboard_documents"
  ADD CONSTRAINT "whiteboard_documents_session_id_fkey"
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
  FOREIGN KEY ("whiteboard_id") REFERENCES "whiteboard_documents"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whiteboard_operations"
  ADD CONSTRAINT "whiteboard_operations_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "whiteboard_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whiteboard_documents" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_whiteboard_documents"
  ON "whiteboard_documents"
  USING (
    "organization_id" = app.current_organization_id()
    AND "workspace_id" = app.current_workspace_id()
  )
  WITH CHECK (
    "organization_id" = app.current_organization_id()
    AND "workspace_id" = app.current_workspace_id()
  );

ALTER TABLE "whiteboard_operations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whiteboard_operations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_whiteboard_operations"
  ON "whiteboard_operations"
  USING (
    "organization_id" = app.current_organization_id()
    AND "workspace_id" = app.current_workspace_id()
  )
  WITH CHECK (
    "organization_id" = app.current_organization_id()
    AND "workspace_id" = app.current_workspace_id()
  );
