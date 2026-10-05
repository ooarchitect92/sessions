CREATE TYPE "CalendarProvider" AS ENUM ('GOOGLE', 'MICROSOFT');
CREATE TYPE "CalendarConnectionStatus" AS ENUM ('ACTIVE', 'REAUTH_REQUIRED', 'ERROR', 'REVOKED');

CREATE TABLE "calendar_connections" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "provider" "CalendarProvider" NOT NULL,
  "status" "CalendarConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
  "provider_account_id" VARCHAR(255) NOT NULL,
  "account_email" CITEXT,
  "access_token_encrypted" TEXT NOT NULL,
  "refresh_token_encrypted" TEXT,
  "access_token_expires_at" TIMESTAMPTZ(6),
  "scopes" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "calendar_ids" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "last_synced_at" TIMESTAMPTZ(6),
  "last_error" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "calendar_connections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "calendar_busy_blocks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "calendar_connection_id" UUID NOT NULL,
  "provider_event_id" VARCHAR(500),
  "starts_at" TIMESTAMPTZ(6) NOT NULL,
  "ends_at" TIMESTAMPTZ(6) NOT NULL,
  "fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "calendar_busy_blocks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "calendar_busy_blocks_range_check" CHECK ("ends_at" > "starts_at")
);

CREATE UNIQUE INDEX "calendar_connections_workspace_id_user_id_provider_key"
  ON "calendar_connections"("workspace_id", "user_id", "provider");
CREATE INDEX "calendar_connections_organization_id_workspace_id_status_idx"
  ON "calendar_connections"("organization_id", "workspace_id", "status");
CREATE INDEX "calendar_connections_user_id_provider_status_idx"
  ON "calendar_connections"("user_id", "provider", "status");

CREATE INDEX "calendar_busy_blocks_organization_id_workspace_id_starts_at_ends_at_idx"
  ON "calendar_busy_blocks"("organization_id", "workspace_id", "starts_at", "ends_at");
CREATE INDEX "calendar_busy_blocks_calendar_connection_id_starts_at_ends_at_idx"
  ON "calendar_busy_blocks"("calendar_connection_id", "starts_at", "ends_at");

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

ALTER TABLE "calendar_busy_blocks"
  ADD CONSTRAINT "calendar_busy_blocks_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calendar_busy_blocks"
  ADD CONSTRAINT "calendar_busy_blocks_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calendar_busy_blocks"
  ADD CONSTRAINT "calendar_busy_blocks_calendar_connection_id_fkey"
  FOREIGN KEY ("calendar_connection_id") REFERENCES "calendar_connections"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "calendar_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "calendar_connections" FORCE ROW LEVEL SECURITY;
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

ALTER TABLE "calendar_busy_blocks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "calendar_busy_blocks" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_calendar_busy_blocks"
  ON "calendar_busy_blocks"
  USING (
    "organization_id" = app.current_organization_id()
    AND "workspace_id" = app.current_workspace_id()
  )
  WITH CHECK (
    "organization_id" = app.current_organization_id()
    AND "workspace_id" = app.current_workspace_id()
  );
