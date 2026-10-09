ALTER TABLE "enterprise_identity_connections"
  ADD COLUMN "end_session_endpoint" TEXT,
  ADD COLUMN "role_mappings" JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "enterprise_identity_connections"
  ADD CONSTRAINT "enterprise_identity_role_mappings_object"
  CHECK (jsonb_typeof("role_mappings") = 'object');