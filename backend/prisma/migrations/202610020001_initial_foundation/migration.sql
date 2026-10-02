CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'HOST', 'MEMBER', 'ANALYST', 'GUEST');
CREATE TYPE "SessionKind" AS ENUM ('MEETING', 'WEBINAR');
CREATE TYPE "SessionStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED', 'PROCESSING', 'READY', 'FAILED');
CREATE TYPE "AgendaItemType" AS ENUM ('TEXT', 'PRESENTATION', 'WEBSITE', 'VIDEO', 'POLL', 'WHITEBOARD', 'BREAKOUT', 'QA', 'SCREEN_SHARE');

CREATE TABLE "organizations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(160) NOT NULL,
  "slug" VARCHAR(100) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workspaces" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "slug" VARCHAR(100) NOT NULL,
  "timezone" VARCHAR(100) NOT NULL DEFAULT 'UTC',
  "settings" JSONB NOT NULL DEFAULT '{}',
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "users" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "email" CITEXT NOT NULL,
  "display_name" VARCHAR(160) NOT NULL,
  "avatar_url" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workspace_memberships" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspace_memberships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rooms" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "slug" VARCHAR(100) NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "settings" JSONB NOT NULL DEFAULT '{}',
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rooms_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "rooms_version_check" CHECK ("version" > 0)
);

CREATE TABLE "sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "room_id" UUID,
  "created_by_id" UUID NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "description" TEXT,
  "kind" "SessionKind" NOT NULL DEFAULT 'MEETING',
  "status" "SessionStatus" NOT NULL DEFAULT 'DRAFT',
  "starts_at" TIMESTAMPTZ(6) NOT NULL,
  "duration_minutes" INTEGER NOT NULL,
  "timezone" VARCHAR(100) NOT NULL,
  "recording_enabled" BOOLEAN NOT NULL DEFAULT false,
  "transcription_enabled" BOOLEAN NOT NULL DEFAULT false,
  "current_agenda_item_id" UUID,
  "livekit_room_name" VARCHAR(200) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sessions_duration_check" CHECK ("duration_minutes" BETWEEN 5 AND 1440),
  CONSTRAINT "sessions_version_check" CHECK ("version" > 0)
);

CREATE TABLE "agenda_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "duration_seconds" INTEGER NOT NULL,
  "type" "AgendaItemType" NOT NULL,
  "content" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agenda_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agenda_items_duration_check" CHECK ("duration_seconds" BETWEEN 0 AND 86400),
  CONSTRAINT "agenda_items_position_check" CHECK ("position" >= 0)
);

CREATE TABLE "idempotency_keys" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "key" VARCHAR(200) NOT NULL,
  "request_hash" VARCHAR(64) NOT NULL,
  "response" JSONB NOT NULL,
  "status_code" INTEGER NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "outbox_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "aggregate_type" VARCHAR(100) NOT NULL,
  "aggregate_id" UUID NOT NULL,
  "event_type" VARCHAR(160) NOT NULL,
  "payload" JSONB NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "locked_at" TIMESTAMPTZ(6),
  "locked_by" VARCHAR(160),
  "published_at" TIMESTAMPTZ(6),
  "last_error" TEXT,
  "dead_lettered_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "action" VARCHAR(160) NOT NULL,
  "resource_type" VARCHAR(100) NOT NULL,
  "resource_id" UUID,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");
CREATE UNIQUE INDEX "workspaces_organization_id_slug_key" ON "workspaces"("organization_id", "slug");
CREATE INDEX "workspaces_organization_id_idx" ON "workspaces"("organization_id");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "workspace_memberships_workspace_id_user_id_key" ON "workspace_memberships"("workspace_id", "user_id");
CREATE INDEX "workspace_memberships_organization_id_workspace_id_idx" ON "workspace_memberships"("organization_id", "workspace_id");
CREATE INDEX "workspace_memberships_user_id_idx" ON "workspace_memberships"("user_id");
CREATE UNIQUE INDEX "rooms_workspace_id_slug_key" ON "rooms"("workspace_id", "slug");
CREATE INDEX "rooms_organization_id_workspace_id_idx" ON "rooms"("organization_id", "workspace_id");
CREATE UNIQUE INDEX "sessions_livekit_room_name_key" ON "sessions"("livekit_room_name");
CREATE INDEX "sessions_organization_id_workspace_id_starts_at_idx" ON "sessions"("organization_id", "workspace_id", "starts_at");
CREATE INDEX "sessions_workspace_id_status_starts_at_idx" ON "sessions"("workspace_id", "status", "starts_at");
CREATE UNIQUE INDEX "agenda_items_session_id_position_key" ON "agenda_items"("session_id", "position");
CREATE INDEX "agenda_items_organization_id_workspace_id_session_id_idx" ON "agenda_items"("organization_id", "workspace_id", "session_id");
CREATE UNIQUE INDEX "idempotency_keys_workspace_id_key_key" ON "idempotency_keys"("workspace_id", "key");
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys"("expires_at");
CREATE INDEX "outbox_events_published_at_dead_lettered_at_available_at_idx" ON "outbox_events"("published_at", "dead_lettered_at", "available_at");
CREATE INDEX "outbox_events_workspace_id_created_at_idx" ON "outbox_events"("workspace_id", "created_at");
CREATE INDEX "audit_events_organization_id_workspace_id_created_at_idx" ON "audit_events"("organization_id", "workspace_id", "created_at");
CREATE INDEX "audit_events_actor_user_id_created_at_idx" ON "audit_events"("actor_user_id", "created_at");

ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agenda_items" ADD CONSTRAINT "agenda_items_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.current_organization_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.organization_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app.current_workspace_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.workspace_id', true), '')::uuid
$$;

ALTER TABLE "workspaces" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspaces" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_workspaces" ON "workspaces"
  USING ("organization_id" = app.current_organization_id() AND "id" = app.current_workspace_id())
  WITH CHECK ("organization_id" = app.current_organization_id() AND "id" = app.current_workspace_id());

ALTER TABLE "workspace_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_memberships" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_workspace_memberships" ON "workspace_memberships"
  USING ("organization_id" = app.current_organization_id() AND "workspace_id" = app.current_workspace_id())
  WITH CHECK ("organization_id" = app.current_organization_id() AND "workspace_id" = app.current_workspace_id());

ALTER TABLE "rooms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rooms" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_rooms" ON "rooms"
  USING ("organization_id" = app.current_organization_id() AND "workspace_id" = app.current_workspace_id())
  WITH CHECK ("organization_id" = app.current_organization_id() AND "workspace_id" = app.current_workspace_id());

ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_sessions" ON "sessions"
  USING ("organization_id" = app.current_organization_id() AND "workspace_id" = app.current_workspace_id())
  WITH CHECK ("organization_id" = app.current_organization_id() AND "workspace_id" = app.current_workspace_id());

ALTER TABLE "agenda_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agenda_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_agenda_items" ON "agenda_items"
  USING ("organization_id" = app.current_organization_id() AND "workspace_id" = app.current_workspace_id())
  WITH CHECK ("organization_id" = app.current_organization_id() AND "workspace_id" = app.current_workspace_id());

ALTER TABLE "idempotency_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "idempotency_keys" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_idempotency_keys" ON "idempotency_keys"
  USING ("organization_id" = app.current_organization_id() AND "workspace_id" = app.current_workspace_id())
  WITH CHECK ("organization_id" = app.current_organization_id() AND "workspace_id" = app.current_workspace_id());

ALTER TABLE "outbox_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "outbox_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_outbox_events" ON "outbox_events"
  USING ("organization_id" = app.current_organization_id() AND "workspace_id" = app.current_workspace_id())
  WITH CHECK ("organization_id" = app.current_organization_id() AND "workspace_id" = app.current_workspace_id());

ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_audit_events" ON "audit_events"
  USING ("organization_id" = app.current_organization_id() AND "workspace_id" = app.current_workspace_id())
  WITH CHECK ("organization_id" = app.current_organization_id() AND "workspace_id" = app.current_workspace_id());
