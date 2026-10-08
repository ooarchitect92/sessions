CREATE TABLE "marketing_consent_evidence" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "lead_id" UUID NOT NULL,
    "purpose" VARCHAR(80) NOT NULL,
    "version" VARCHAR(80) NOT NULL,
    "statement_hash" VARCHAR(64) NOT NULL,
    "captured_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "marketing_consent_evidence_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "marketing_consent_evidence_lead_id_fkey"
      FOREIGN KEY ("lead_id") REFERENCES "marketing_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "marketing_consent_evidence_lead_id_key"
  ON "marketing_consent_evidence"("lead_id");

CREATE TABLE "marketing_lead_audit_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "lead_id" UUID NOT NULL,
    "action" VARCHAR(160) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "marketing_lead_audit_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "marketing_lead_audit_events_lead_id_fkey"
      FOREIGN KEY ("lead_id") REFERENCES "marketing_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "marketing_lead_audit_events_lead_id_created_at_idx"
  ON "marketing_lead_audit_events"("lead_id", "created_at");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_api') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE "marketing_consent_evidence" TO sessions_api;
    GRANT SELECT, INSERT, UPDATE ON TABLE "marketing_lead_audit_events" TO sessions_api;
  END IF;
END $$;
