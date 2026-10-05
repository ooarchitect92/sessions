CREATE TYPE "EventStageRole" AS ENUM ('ORGANIZER', 'HOST', 'COHOST', 'SPEAKER');

CREATE TABLE "event_speakers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "user_id" UUID,
  "role" "EventStageRole" NOT NULL DEFAULT 'SPEAKER',
  "position" INTEGER NOT NULL,
  "display_name" VARCHAR(160) NOT NULL,
  "email" CITEXT,
  "title" VARCHAR(160),
  "bio" TEXT,
  "avatar_url" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_speakers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_speakers_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "events"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "event_speakers_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "event_speakers_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "event_speakers_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "event_speakers_position_check" CHECK ("position" >= 0)
);

CREATE UNIQUE INDEX "event_speakers_event_id_position_key"
  ON "event_speakers"("event_id", "position");

CREATE UNIQUE INDEX "event_speakers_event_id_user_id_key"
  ON "event_speakers"("event_id", "user_id");

CREATE UNIQUE INDEX "event_speakers_event_id_email_key"
  ON "event_speakers"("event_id", "email");

CREATE INDEX "event_speakers_organization_id_workspace_id_event_id_idx"
  ON "event_speakers"("organization_id", "workspace_id", "event_id");

CREATE INDEX "event_speakers_workspace_id_user_id_idx"
  ON "event_speakers"("workspace_id", "user_id");

ALTER TABLE "event_speakers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "event_speakers" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_event_speakers"
  ON "event_speakers"
  USING (
    "organization_id" = app.current_organization_id()
    AND "workspace_id" = app.current_workspace_id()
  )
  WITH CHECK (
    "organization_id" = app.current_organization_id()
    AND "workspace_id" = app.current_workspace_id()
  );
