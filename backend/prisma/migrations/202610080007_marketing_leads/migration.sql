CREATE TABLE "marketing_leads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" VARCHAR(40) NOT NULL,
    "name" VARCHAR(160),
    "email" CITEXT NOT NULL,
    "company" VARCHAR(160),
    "team_size" VARCHAR(40),
    "message" TEXT,
    "source_path" VARCHAR(500),
    "consent" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "marketing_leads_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "marketing_leads_kind_created_at_idx"
  ON "marketing_leads"("kind", "created_at");
CREATE INDEX "marketing_leads_email_created_at_idx"
  ON "marketing_leads"("email", "created_at");

ALTER TABLE "marketing_leads"
  ADD CONSTRAINT "marketing_leads_kind_check"
    CHECK ("kind" IN ('DEMO', 'CONTACT', 'NEWSLETTER')),
  ADD CONSTRAINT "marketing_leads_consent_check"
    CHECK ("consent" = true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_api') THEN
    GRANT SELECT, INSERT ON TABLE "marketing_leads" TO sessions_api;
  END IF;
END $$;
