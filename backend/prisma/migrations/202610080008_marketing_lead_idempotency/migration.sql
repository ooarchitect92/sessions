ALTER TABLE "marketing_leads"
  ADD COLUMN "submission_key" UUID,
  ADD COLUMN "request_hash" VARCHAR(64);

UPDATE "marketing_leads"
SET
  "submission_key" = gen_random_uuid(),
  "request_hash" = encode(digest("id"::text, 'sha256'), 'hex')
WHERE "submission_key" IS NULL OR "request_hash" IS NULL;

ALTER TABLE "marketing_leads"
  ALTER COLUMN "submission_key" SET NOT NULL,
  ALTER COLUMN "request_hash" SET NOT NULL;

CREATE UNIQUE INDEX "marketing_leads_submission_key_key"
  ON "marketing_leads"("submission_key");
