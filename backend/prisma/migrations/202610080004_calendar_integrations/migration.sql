CREATE TYPE "CalendarProvider" AS ENUM ('GOOGLE', 'MICROSOFT');
CREATE TYPE "CalendarConnectionStatus" AS ENUM ('ACTIVE', 'ERROR', 'REVOKED');

CREATE TABLE "calendar_connections" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "provider" "CalendarProvider" NOT NULL,
  "status" "CalendarConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
  "external_account_id" VARCHAR(255),
  "external_account_email" CITEXT,
  "calendar_id" VARCHAR(255) NOT NULL DEFAULT 'primary',
  "encrypted_access_token" TEXT NOT NULL,
  "encrypted_refresh_token" TEXT,
  "token_expires_at" TIMESTAMPTZ(6),
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "sync_enabled" BOOLEAN NOT NULL DEFAULT true,
  "last_sync_at" TIMESTAMPTZ(6),
  "last_error" VARCHAR(500),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "calendar_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "calendar_connections_workspace_id_user_id_provider_key"
  ON "calendar_connections"("workspace_id","user_id","provider");
CREATE INDEX "calendar_connections_organization_id_workspace_id_status_idx"
  ON "calendar_connections"("organization_id","workspace_id","status");

ALTER TABLE "calendar_connections"
  ADD CONSTRAINT "calendar_connections_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calendar_connections"
  ADD CONSTRAINT "calendar_connections_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calendar_connections"
  ADD CONSTRAINT "calendar_connections_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "calendar_oauth_states" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "provider" "CalendarProvider" NOT NULL,
  "state_hash" VARCHAR(64) NOT NULL,
  "redirect_uri" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "consumed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "calendar_oauth_states_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "calendar_oauth_states_hash_check" CHECK ("state_hash" ~ '^[a-f0-9]{64}$')
);

CREATE UNIQUE INDEX "calendar_oauth_states_state_hash_key"
  ON "calendar_oauth_states"("state_hash");
CREATE INDEX "calendar_oauth_states_organization_id_workspace_id_user_id_provider_idx"
  ON "calendar_oauth_states"("organization_id","workspace_id","user_id","provider");
CREATE INDEX "calendar_oauth_states_expires_at_idx"
  ON "calendar_oauth_states"("expires_at");

ALTER TABLE "calendar_oauth_states"
  ADD CONSTRAINT "calendar_oauth_states_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calendar_oauth_states"
  ADD CONSTRAINT "calendar_oauth_states_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calendar_oauth_states"
  ADD CONSTRAINT "calendar_oauth_states_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "calendar_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "calendar_connections" FORCE ROW LEVEL SECURITY;
ALTER TABLE "calendar_oauth_states" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "calendar_oauth_states" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_calendar_connections" ON "calendar_connections"
  USING (
    organization_id = app.current_organization_id()
    AND workspace_id = app.current_workspace_id()
  )
  WITH CHECK (
    organization_id = app.current_organization_id()
    AND workspace_id = app.current_workspace_id()
  );

CREATE POLICY "tenant_isolation_calendar_oauth_states" ON "calendar_oauth_states"
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
    GRANT SELECT, INSERT, UPDATE, DELETE ON calendar_connections, calendar_oauth_states TO sessions_api;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON calendar_connections, calendar_oauth_states TO sessions_worker;
  END IF;
END $$;
