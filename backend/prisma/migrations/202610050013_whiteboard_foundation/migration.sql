CREATE TYPE "WhiteboardOperationKind" AS ENUM (
  'STROKE',
  'SHAPE',
  'TEXT',
  'STICKY',
  'IMAGE',
  'CLEAR'
);

CREATE TABLE "whiteboard_documents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 0,
  "snapshot_version" INTEGER NOT NULL DEFAULT 0,
  "snapshot" JSONB NOT NULL DEFAULT '[]',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "whiteboard_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "whiteboard_operations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "document_id" UUID NOT NULL,
  "operation_id" UUID NOT NULL,
  "author_user_id" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "kind" "WhiteboardOperationKind" NOT NULL,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "whiteboard_operations_pkey" PRIMARY KEY ("id")
);

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
  ADD CONSTRAINT "whiteboard_operations_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "whiteboard_documents"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whiteboard_operations"
  ADD CONSTRAINT "whiteboard_operations_author_user_id_fkey"
  FOREIGN KEY ("author_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "whiteboard_documents_session_id_key"
  ON "whiteboard_documents"("session_id");
CREATE INDEX "whiteboard_documents_organization_id_workspace_id_session_id_idx"
  ON "whiteboard_documents"("organization_id", "workspace_id", "session_id");
CREATE UNIQUE INDEX "whiteboard_operations_document_id_sequence_key"
  ON "whiteboard_operations"("document_id", "sequence");
CREATE UNIQUE INDEX "whiteboard_operations_document_id_operation_id_key"
  ON "whiteboard_operations"("document_id", "operation_id");
CREATE INDEX "whiteboard_operations_organization_id_workspace_id_session_id_idx"
  ON "whiteboard_operations"("organization_id", "workspace_id", "session_id");
CREATE INDEX "whiteboard_operations_document_id_sequence_idx"
  ON "whiteboard_operations"("document_id", "sequence");

ALTER TABLE "whiteboard_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whiteboard_documents" FORCE ROW LEVEL SECURITY;
ALTER TABLE "whiteboard_operations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whiteboard_operations" FORCE ROW LEVEL SECURITY;

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

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_api') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "whiteboard_documents" TO sessions_api;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "whiteboard_operations" TO sessions_api;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "whiteboard_documents" TO sessions_worker;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "whiteboard_operations" TO sessions_worker;
  END IF;
END $$;
