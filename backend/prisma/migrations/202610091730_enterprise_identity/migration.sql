CREATE TABLE "enterprise_identity_connections" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "workspace_id" UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "protocol" VARCHAR(16) NOT NULL DEFAULT 'OIDC',
  "enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "enforce_sso" BOOLEAN NOT NULL DEFAULT FALSE,
  "issuer_url" TEXT,
  "client_id" VARCHAR(255),
  "encrypted_client_secret" TEXT,
  "authorization_endpoint" TEXT,
  "token_endpoint" TEXT,
  "userinfo_endpoint" TEXT,
  "jwks_uri" TEXT,
  "scopes" JSONB NOT NULL DEFAULT '["openid","profile","email"]'::jsonb,
  "email_domains" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "role_attribute" VARCHAR(120),
  "default_role" VARCHAR(32) NOT NULL DEFAULT 'MEMBER',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("workspace_id"),
  CHECK ("protocol" IN ('OIDC','SAML')),
  CHECK ("default_role" IN ('ADMIN','HOST','MEMBER','ANALYST','GUEST'))
);

CREATE TABLE "scim_tokens" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "workspace_id" UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "name" VARCHAR(120) NOT NULL,
  "key_prefix" VARCHAR(32) NOT NULL,
  "token_hash" CHAR(64) NOT NULL UNIQUE,
  "last_used_at" TIMESTAMPTZ,
  "expires_at" TIMESTAMPTZ,
  "revoked_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "scim_external_identities" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "workspace_id" UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "external_id" VARCHAR(255) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("workspace_id", "external_id"),
  UNIQUE ("workspace_id", "user_id")
);

CREATE INDEX "enterprise_identity_tenant_idx" ON "enterprise_identity_connections" ("organization_id", "workspace_id");
CREATE INDEX "scim_tokens_tenant_idx" ON "scim_tokens" ("organization_id", "workspace_id", "revoked_at");
CREATE INDEX "scim_external_identity_tenant_idx" ON "scim_external_identities" ("organization_id", "workspace_id", "user_id");

ALTER TABLE "enterprise_identity_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "enterprise_identity_connections" FORCE ROW LEVEL SECURITY;
CREATE POLICY "enterprise_identity_connections_tenant_isolation" ON "enterprise_identity_connections"
USING ("organization_id" = current_setting('app.organization_id', true)::uuid AND "workspace_id" = current_setting('app.workspace_id', true)::uuid)
WITH CHECK ("organization_id" = current_setting('app.organization_id', true)::uuid AND "workspace_id" = current_setting('app.workspace_id', true)::uuid);

ALTER TABLE "scim_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "scim_tokens" FORCE ROW LEVEL SECURITY;
CREATE POLICY "scim_tokens_tenant_isolation" ON "scim_tokens"
USING ("organization_id" = current_setting('app.organization_id', true)::uuid AND "workspace_id" = current_setting('app.workspace_id', true)::uuid)
WITH CHECK ("organization_id" = current_setting('app.organization_id', true)::uuid AND "workspace_id" = current_setting('app.workspace_id', true)::uuid);

ALTER TABLE "scim_external_identities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "scim_external_identities" FORCE ROW LEVEL SECURITY;
CREATE POLICY "scim_external_identities_tenant_isolation" ON "scim_external_identities"
USING ("organization_id" = current_setting('app.organization_id', true)::uuid AND "workspace_id" = current_setting('app.workspace_id', true)::uuid)
WITH CHECK ("organization_id" = current_setting('app.organization_id', true)::uuid AND "workspace_id" = current_setting('app.workspace_id', true)::uuid);