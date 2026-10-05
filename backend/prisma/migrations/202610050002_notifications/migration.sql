CREATE TYPE "NotificationKind" AS ENUM (
  'BOOKING_CONFIRMATION',
  'BOOKING_REMINDER_24H',
  'BOOKING_REMINDER_1H',
  'EVENT_REGISTRATION_CONFIRMATION',
  'EVENT_REMINDER_24H',
  'EVENT_REMINDER_1H'
);

CREATE TYPE "NotificationDeliveryStatus" AS ENUM (
  'PENDING',
  'DELIVERING',
  'RETRYING',
  'SENT',
  'FAILED',
  'CANCELLED'
);

ALTER TABLE "booking_reservations"
  ADD COLUMN "management_token_encrypted" TEXT;

CREATE TABLE "notification_templates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "kind" "NotificationKind" NOT NULL,
  "subject_template" VARCHAR(300) NOT NULL,
  "text_template" TEXT NOT NULL,
  "html_template" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_templates_version_check" CHECK ("version" >= 1)
);

CREATE TABLE "notification_deliveries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "kind" "NotificationKind" NOT NULL,
  "dedupe_key" VARCHAR(255) NOT NULL,
  "source_id" UUID NOT NULL,
  "source_starts_at" TIMESTAMPTZ(6),
  "recipient_email" CITEXT NOT NULL,
  "recipient_name" VARCHAR(160),
  "subject" VARCHAR(300) NOT NULL,
  "text_body" TEXT NOT NULL,
  "html_body" TEXT,
  "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "provider" VARCHAR(80),
  "provider_message_id" VARCHAR(255),
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "scheduled_for" TIMESTAMPTZ(6) NOT NULL,
  "next_attempt_at" TIMESTAMPTZ(6) NOT NULL,
  "sent_at" TIMESTAMPTZ(6),
  "last_error" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_deliveries_attempt_count_check" CHECK ("attempt_count" >= 0)
);

CREATE UNIQUE INDEX "notification_templates_workspace_id_kind_key"
  ON "notification_templates"("workspace_id", "kind");
CREATE INDEX "notification_templates_organization_id_workspace_id_active_idx"
  ON "notification_templates"("organization_id", "workspace_id", "active");

CREATE UNIQUE INDEX "notification_deliveries_dedupe_key_key"
  ON "notification_deliveries"("dedupe_key");
CREATE INDEX "notification_deliveries_organization_id_workspace_id_status_next_attempt_at_idx"
  ON "notification_deliveries"("organization_id", "workspace_id", "status", "next_attempt_at");
CREATE INDEX "notification_deliveries_source_id_kind_scheduled_for_idx"
  ON "notification_deliveries"("source_id", "kind", "scheduled_for");

ALTER TABLE "notification_templates"
  ADD CONSTRAINT "notification_templates_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_templates"
  ADD CONSTRAINT "notification_templates_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_deliveries"
  ADD CONSTRAINT "notification_deliveries_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_deliveries"
  ADD CONSTRAINT "notification_deliveries_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_templates" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_notification_templates"
  ON "notification_templates"
  USING (
    "organization_id" = app.current_organization_id()
    AND "workspace_id" = app.current_workspace_id()
  )
  WITH CHECK (
    "organization_id" = app.current_organization_id()
    AND "workspace_id" = app.current_workspace_id()
  );

ALTER TABLE "notification_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_deliveries" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_notification_deliveries"
  ON "notification_deliveries"
  USING (
    "organization_id" = app.current_organization_id()
    AND "workspace_id" = app.current_workspace_id()
  )
  WITH CHECK (
    "organization_id" = app.current_organization_id()
    AND "workspace_id" = app.current_workspace_id()
  );
