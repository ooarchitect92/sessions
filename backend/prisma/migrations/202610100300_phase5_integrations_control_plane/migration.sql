CREATE TYPE "ApiKeyStatus" AS ENUM ('ACTIVE', 'REVOKED');

CREATE TABLE "api_keys" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "created_by_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "prefix" VARCHAR(24) NOT NULL,
  "secret_hash" VARCHAR(64) NOT NULL,
  "scopes" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "status" "ApiKeyStatus" NOT NULL DEFAULT 'ACTIVE',
  "last_used_at" TIMESTAMPTZ(6),
  "expires_at" TIMESTAMPTZ(6),
  "revoked_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "webhook_subscriptions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "created_by_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "endpoint_url" TEXT NOT NULL,
  "event_types" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "secret_ciphertext" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhook_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "api_keys_workspace_prefix_key" ON "api_keys"("workspace_id", "prefix");
CREATE INDEX "api_keys_org_workspace_status_created_idx" ON "api_keys"("organization_id", "workspace_id", "status", "created_at");
CREATE INDEX "api_keys_secret_hash_idx" ON "api_keys"("secret_hash");
CREATE INDEX "webhook_subscriptions_org_workspace_enabled_created_idx" ON "webhook_subscriptions"("organization_id", "workspace_id", "enabled", "created_at");

ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "api_keys" FORCE ROW LEVEL SECURITY;
ALTER TABLE "webhook_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_subscriptions" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_api_keys" ON "api_keys"
  USING (organization_id = app.current_organization_id() AND workspace_id = app.current_workspace_id())
  WITH CHECK (organization_id = app.current_organization_id() AND workspace_id = app.current_workspace_id());

CREATE POLICY "tenant_isolation_webhook_subscriptions" ON "webhook_subscriptions"
  USING (organization_id = app.current_organization_id() AND workspace_id = app.current_workspace_id())
  WITH CHECK (organization_id = app.current_organization_id() AND workspace_id = app.current_workspace_id());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_api') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE api_keys, webhook_subscriptions TO sessions_api;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE api_keys, webhook_subscriptions TO sessions_worker;
  END IF;
END $$;
