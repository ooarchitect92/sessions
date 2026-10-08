CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "memory_embedding_indexes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "transcript_id" UUID NOT NULL,
  "source_transcript_version" INTEGER NOT NULL,
  "provider" VARCHAR(100) NOT NULL,
  "model" VARCHAR(160) NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  "chunk_count" INTEGER NOT NULL DEFAULT 0,
  "failure_code" VARCHAR(160),
  "completed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "memory_embedding_indexes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "memory_embedding_indexes_transcript_id_key" UNIQUE ("transcript_id"),
  CONSTRAINT "memory_embedding_indexes_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "memory_embedding_indexes_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "memory_embedding_indexes_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "sessions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "memory_embedding_indexes_transcript_id_fkey"
    FOREIGN KEY ("transcript_id") REFERENCES "transcripts"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "memory_embedding_indexes_workspace_status_idx"
  ON "memory_embedding_indexes"("organization_id", "workspace_id", "status", "updated_at");

CREATE TABLE "memory_embedding_chunks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "index_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "transcript_id" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  "start_ms" INTEGER,
  "end_ms" INTEGER,
  "content" TEXT NOT NULL,
  "embedding" vector(1536) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "memory_embedding_chunks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "memory_embedding_chunks_index_position_key" UNIQUE ("index_id", "position"),
  CONSTRAINT "memory_embedding_chunks_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "memory_embedding_chunks_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "memory_embedding_chunks_index_id_fkey"
    FOREIGN KEY ("index_id") REFERENCES "memory_embedding_indexes"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "memory_embedding_chunks_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "sessions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "memory_embedding_chunks_transcript_id_fkey"
    FOREIGN KEY ("transcript_id") REFERENCES "transcripts"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "memory_embedding_chunks_workspace_session_idx"
  ON "memory_embedding_chunks"("organization_id", "workspace_id", "session_id", "position");

CREATE INDEX "memory_embedding_chunks_embedding_hnsw_idx"
  ON "memory_embedding_chunks"
  USING hnsw ("embedding" vector_cosine_ops);

ALTER TABLE "memory_embedding_indexes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memory_embedding_indexes" FORCE ROW LEVEL SECURITY;
ALTER TABLE "memory_embedding_chunks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memory_embedding_chunks" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_memory_embedding_indexes"
  ON "memory_embedding_indexes"
  USING (
    organization_id = app.current_organization_id()
    AND workspace_id = app.current_workspace_id()
  )
  WITH CHECK (
    organization_id = app.current_organization_id()
    AND workspace_id = app.current_workspace_id()
  );

CREATE POLICY "tenant_isolation_memory_embedding_chunks"
  ON "memory_embedding_chunks"
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
    GRANT SELECT ON TABLE memory_embedding_indexes, memory_embedding_chunks TO sessions_api;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON TABLE memory_embedding_indexes, memory_embedding_chunks TO sessions_worker;
  END IF;
END $$;
