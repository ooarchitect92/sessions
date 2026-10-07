CREATE TYPE "EventReminderKind" AS ENUM (
  'EVENT_REMINDER_24H',
  'EVENT_REMINDER_1H'
);

CREATE TABLE "event_notification_templates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "kind" "EventReminderKind" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "subject" VARCHAR(240) NOT NULL,
  "body_text" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_notification_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_notification_templates_version_check" CHECK ("version" > 0)
);

CREATE TABLE "event_notification_deliveries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "event_registration_id" UUID NOT NULL,
  "kind" "EventReminderKind" NOT NULL,
  "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
  "recipient_email" CITEXT NOT NULL,
  "scheduled_for" TIMESTAMPTZ(6) NOT NULL,
  "template_version" INTEGER NOT NULL,
  "subject" VARCHAR(240) NOT NULL,
  "body_text" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMPTZ(6),
  "provider" VARCHAR(80),
  "provider_message_id" VARCHAR(255),
  "last_error" VARCHAR(500),
  "delivered_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_notification_deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_notification_deliveries_attempts_check" CHECK ("attempts" >= 0),
  CONSTRAINT "event_notification_deliveries_template_version_check" CHECK ("template_version" > 0)
);

CREATE UNIQUE INDEX "event_notification_templates_event_id_kind_key"
  ON "event_notification_templates"("event_id","kind");
CREATE INDEX "event_notification_templates_organization_id_workspace_id_event_id_idx"
  ON "event_notification_templates"("organization_id","workspace_id","event_id");

CREATE UNIQUE INDEX "event_notification_deliveries_event_registration_id_kind_scheduled_for_key"
  ON "event_notification_deliveries"("event_registration_id","kind","scheduled_for");
CREATE INDEX "event_notification_deliveries_status_next_attempt_at_scheduled_for_idx"
  ON "event_notification_deliveries"("status","next_attempt_at","scheduled_for");
CREATE INDEX "event_notification_deliveries_organization_id_workspace_id_created_at_idx"
  ON "event_notification_deliveries"("organization_id","workspace_id","created_at");

ALTER TABLE "event_notification_templates"
  ADD CONSTRAINT "event_notification_templates_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_notification_templates"
  ADD CONSTRAINT "event_notification_templates_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_notification_templates"
  ADD CONSTRAINT "event_notification_templates_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_notification_deliveries"
  ADD CONSTRAINT "event_notification_deliveries_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_notification_deliveries"
  ADD CONSTRAINT "event_notification_deliveries_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_notification_deliveries"
  ADD CONSTRAINT "event_notification_deliveries_event_registration_id_fkey"
  FOREIGN KEY ("event_registration_id") REFERENCES "event_registrations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "event_notification_templates" (
  "organization_id",
  "workspace_id",
  "event_id",
  "kind",
  "subject",
  "body_text"
)
SELECT
  e."organization_id",
  e."workspace_id",
  e."id",
  'EVENT_REMINDER_24H'::"EventReminderKind",
  'Reminder: {{event_title}} starts tomorrow',
  E'Hi {{attendee_name}},\n\n{{event_title}} starts in 24 hours.\n\nTime: {{event_time}} ({{event_timezone}})\n\nWe look forward to seeing you.'
FROM "events" e
ON CONFLICT ("event_id","kind") DO NOTHING;

INSERT INTO "event_notification_templates" (
  "organization_id",
  "workspace_id",
  "event_id",
  "kind",
  "subject",
  "body_text"
)
SELECT
  e."organization_id",
  e."workspace_id",
  e."id",
  'EVENT_REMINDER_1H'::"EventReminderKind",
  'Reminder: {{event_title}} starts in 1 hour',
  E'Hi {{attendee_name}},\n\n{{event_title}} starts in 1 hour.\n\nTime: {{event_time}} ({{event_timezone}})\n\nYour event is coming up soon.'
FROM "events" e
ON CONFLICT ("event_id","kind") DO NOTHING;

ALTER TABLE "event_notification_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "event_notification_templates" FORCE ROW LEVEL SECURITY;
ALTER TABLE "event_notification_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "event_notification_deliveries" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_event_notification_templates"
  ON "event_notification_templates"
  USING (
    organization_id = app.current_organization_id()
    AND workspace_id = app.current_workspace_id()
  )
  WITH CHECK (
    organization_id = app.current_organization_id()
    AND workspace_id = app.current_workspace_id()
  );

CREATE POLICY "tenant_isolation_event_notification_deliveries"
  ON "event_notification_deliveries"
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
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE event_notification_templates TO sessions_api;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE event_notification_deliveries TO sessions_api;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE event_notification_templates TO sessions_worker;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE event_notification_deliveries TO sessions_worker;
  END IF;
END $$;
