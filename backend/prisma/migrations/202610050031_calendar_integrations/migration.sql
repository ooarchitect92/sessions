CREATE TYPE "CalendarProvider" AS ENUM ('GOOGLE', 'MICROSOFT');
CREATE TYPE "CalendarConnectionStatus" AS ENUM ('CONNECTED', 'EXPIRED', 'REVOKED', 'ERROR');

CREATE TABLE "calendar_connections" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "provider" "CalendarProvider" NOT NULL,
  "provider_account_id" VARCHAR(255),
  "account_email" CITEXT,
  "encrypted_access_token" TEXT NOT NULL,
  "encrypted_refresh_token" TEXT,
  "token_expires_at" TIMESTAMPTZ(6),
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "calendar_id" VARCHAR(255),
  "sync_enabled" BOOLEAN NOT NULL DEFAULT true,
  "status" "CalendarConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
  "last_synced_at" TIMESTAMPTZ(6),
  "last_error" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "calendar_connections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "calendar_oauth_states" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "provider" "CalendarProvider" NOT NULL,
  "state_hash" VARCHAR(64) NOT NULL,
  "return_url" TEXT,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "used_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "calendar_oauth_states_pkey" PRIMARY KEY ("id")
);

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

CREATE UNIQUE INDEX "calendar_connections_workspace_id_user_id_provider_key"
  ON "calendar_connections"("workspace_id", "user_id", "provider");
CREATE INDEX "calendar_connections_organization_id_workspace_id_status_idx"
  ON "calendar_connections"("organization_id", "workspace_id", "status");
CREATE INDEX "calendar_connections_user_id_provider_idx"
  ON "calendar_connections"("user_id", "provider");
CREATE INDEX "calendar_oauth_states_organization_id_workspace_id_expires_at_idx"
  ON "calendar_oauth_states"("organization_id", "workspace_id", "expires_at");
CREATE INDEX "calendar_oauth_states_user_id_provider_expires_at_idx"
  ON "calendar_oauth_states"("user_id", "provider", "expires_at");

ALTER TABLE "calendar_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "calendar_connections" FORCE ROW LEVEL SECURITY;
ALTER TABLE "calendar_oauth_states" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "calendar_oauth_states" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_calendar_connections"
  ON "calendar_connections"
  USING (
    "organization_id" = app.current_organization_id()
    AND "workspace_id" = app.current_workspace_id()
  )
  WITH CHECK (
    "organization_id" = app.current_organization_id()
    AND "workspace_id" = app.current_workspace_id()
  );

CREATE POLICY "tenant_isolation_calendar_oauth_states"
  ON "calendar_oauth_states"
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
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "calendar_connections" TO sessions_api;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "calendar_oauth_states" TO sessions_api;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "calendar_connections" TO sessions_worker;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "calendar_oauth_states" TO sessions_worker;
  END IF;
END $$;
