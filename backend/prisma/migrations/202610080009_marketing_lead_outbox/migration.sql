CREATE TABLE "marketing_lead_outbox_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "lead_id" UUID NOT NULL,
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
    CONSTRAINT "marketing_lead_outbox_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "marketing_lead_outbox_events_lead_id_fkey"
      FOREIGN KEY ("lead_id") REFERENCES "marketing_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "marketing_lead_outbox_events_lead_id_event_type_key"
  ON "marketing_lead_outbox_events"("lead_id", "event_type");

CREATE INDEX "marketing_lead_outbox_events_delivery_idx"
  ON "marketing_lead_outbox_events"("published_at", "dead_lettered_at", "available_at");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_api') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE "marketing_lead_outbox_events" TO sessions_api;
  END IF;
END $$;
