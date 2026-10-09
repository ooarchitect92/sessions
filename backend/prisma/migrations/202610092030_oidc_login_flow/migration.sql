CREATE TABLE "enterprise_oidc_identities" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "workspace_id" UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "issuer" TEXT NOT NULL,
  "subject" VARCHAR(512) NOT NULL,
  "email" VARCHAR(320) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("workspace_id", "issuer", "subject"),
  UNIQUE ("workspace_id", "user_id")
);

CREATE TABLE "oidc_login_requests" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "workspace_id" UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "state_hash" CHAR(64) NOT NULL UNIQUE,
  "nonce_hash" CHAR(64) NOT NULL,
  "encrypted_code_verifier" TEXT NOT NULL,
  "return_to" TEXT,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "consumed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "oidc_login_grants" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "workspace_id" UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "grant_hash" CHAR(64) NOT NULL UNIQUE,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "consumed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "enterprise_oidc_identity_tenant_idx" ON "enterprise_oidc_identities" ("organization_id", "workspace_id", "user_id");
CREATE INDEX "oidc_login_request_expiry_idx" ON "oidc_login_requests" ("expires_at", "consumed_at");
CREATE INDEX "oidc_login_grant_expiry_idx" ON "oidc_login_grants" ("expires_at", "consumed_at");

ALTER TABLE "enterprise_oidc_identities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "enterprise_oidc_identities" FORCE ROW LEVEL SECURITY;
CREATE POLICY "enterprise_oidc_identities_tenant_isolation" ON "enterprise_oidc_identities"
USING ("organization_id" = current_setting('app.organization_id', true)::uuid AND "workspace_id" = current_setting('app.workspace_id', true)::uuid)
WITH CHECK ("organization_id" = current_setting('app.organization_id', true)::uuid AND "workspace_id" = current_setting('app.workspace_id', true)::uuid);