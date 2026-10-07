CREATE TABLE "api_keys" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "token_prefix" VARCHAR(32) NOT NULL,
  "token_hash" VARCHAR(64) NOT NULL,
  "role" "WorkspaceRole" NOT NULL DEFAULT 'HOST',
  "scopes" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "last_used_at" TIMESTAMPTZ(6),
  "expires_at" TIMESTAMPTZ(6),
  "revoked_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "api_keys"
  ADD CONSTRAINT "api_keys_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "api_keys"
  ADD CONSTRAINT "api_keys_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "api_keys"
  ADD CONSTRAINT "api_keys_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "api_keys_organization_id_workspace_id_revoked_at_idx"
  ON "api_keys"("organization_id", "workspace_id", "revoked_at");
CREATE INDEX "api_keys_token_prefix_idx"
  ON "api_keys"("token_prefix");

ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "api_keys" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_api_keys"
  ON "api_keys"
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
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "api_keys" TO sessions_api;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "api_keys" TO sessions_worker;
  END IF;
END $$;
