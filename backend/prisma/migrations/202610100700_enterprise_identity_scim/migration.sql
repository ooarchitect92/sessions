CREATE TYPE "EnterpriseIdentityProviderKind" AS ENUM ('OIDC', 'SAML');
CREATE TYPE "EnterpriseIdentityProviderStatus" AS ENUM ('ACTIVE', 'DISABLED', 'ERROR');
CREATE TYPE "EnterpriseIdentityKind" AS ENUM ('OIDC');
CREATE TYPE "ScimTokenStatus" AS ENUM ('ACTIVE', 'REVOKED');

CREATE TABLE "enterprise_identity_providers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "kind" "EnterpriseIdentityProviderKind" NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "status" "EnterpriseIdentityProviderStatus" NOT NULL DEFAULT 'ACTIVE',
  "issuer" TEXT,
  "client_id" VARCHAR(500),
  "client_secret_ciphertext" TEXT,
  "authorization_endpoint" TEXT,
  "token_endpoint" TEXT,
  "jwks_uri" TEXT,
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY['openid','email','profile']::TEXT[],
  "allowed_domains" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "email_claim" VARCHAR(100) NOT NULL DEFAULT 'email',
  "name_claim" VARCHAR(100) NOT NULL DEFAULT 'name',
  "default_role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
  "enforce_sso" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "last_validated_at" TIMESTAMPTZ(6),
  "last_error" VARCHAR(1000),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "enterprise_identity_providers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "enterprise_identity_providers_workspace_name_key"
  ON "enterprise_identity_providers"("workspace_id","name");
CREATE INDEX "enterprise_identity_providers_org_workspace_kind_status_idx"
  ON "enterprise_identity_providers"("organization_id","workspace_id","kind","status");

CREATE TABLE "enterprise_identities" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "provider_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "kind" "EnterpriseIdentityKind" NOT NULL DEFAULT 'OIDC',
  "external_subject" VARCHAR(500) NOT NULL,
  "linked_email" CITEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "enterprise_identities_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "enterprise_identities_provider_kind_subject_key"
  ON "enterprise_identities"("provider_id","kind","external_subject");
CREATE UNIQUE INDEX "enterprise_identities_provider_user_kind_key"
  ON "enterprise_identities"("provider_id","user_id","kind");
CREATE INDEX "enterprise_identities_org_workspace_user_idx"
  ON "enterprise_identities"("organization_id","workspace_id","user_id");

CREATE TABLE "oidc_login_states" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "provider_id" UUID NOT NULL,
  "state_hash" VARCHAR(64) NOT NULL,
  "nonce_hash" VARCHAR(64) NOT NULL,
  "code_verifier_ciphertext" TEXT NOT NULL,
  "redirect_uri" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "consumed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "oidc_login_states_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "oidc_login_states_state_hash_key" ON "oidc_login_states"("state_hash");
CREATE INDEX "oidc_login_states_provider_expiry_consumed_idx"
  ON "oidc_login_states"("provider_id","expires_at","consumed_at");

CREATE TABLE "scim_tokens" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "provider_id" UUID NOT NULL,
  "created_by_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "prefix" VARCHAR(24) NOT NULL,
  "secret_hash" VARCHAR(64) NOT NULL,
  "status" "ScimTokenStatus" NOT NULL DEFAULT 'ACTIVE',
  "last_used_at" TIMESTAMPTZ(6),
  "expires_at" TIMESTAMPTZ(6),
  "revoked_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "scim_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "scim_tokens_workspace_prefix_key" ON "scim_tokens"("workspace_id","prefix");
CREATE INDEX "scim_tokens_provider_status_created_idx" ON "scim_tokens"("provider_id","status","created_at");
CREATE INDEX "scim_tokens_secret_hash_idx" ON "scim_tokens"("secret_hash");

ALTER TABLE "enterprise_identity_providers"
  ADD CONSTRAINT "enterprise_identity_providers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "enterprise_identity_providers_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "enterprise_identities"
  ADD CONSTRAINT "enterprise_identities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "enterprise_identities_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "enterprise_identities_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "enterprise_identity_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "enterprise_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "oidc_login_states"
  ADD CONSTRAINT "oidc_login_states_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "oidc_login_states_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "oidc_login_states_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "enterprise_identity_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scim_tokens"
  ADD CONSTRAINT "scim_tokens_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "scim_tokens_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "scim_tokens_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "enterprise_identity_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "scim_tokens_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "enterprise_identity_providers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "enterprise_identity_providers" FORCE ROW LEVEL SECURITY;
ALTER TABLE "enterprise_identities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "enterprise_identities" FORCE ROW LEVEL SECURITY;
ALTER TABLE "oidc_login_states" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "oidc_login_states" FORCE ROW LEVEL SECURITY;
ALTER TABLE "scim_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "scim_tokens" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_enterprise_identity_providers" ON "enterprise_identity_providers"
USING (organization_id = app.current_organization_id() AND workspace_id = app.current_workspace_id())
WITH CHECK (organization_id = app.current_organization_id() AND workspace_id = app.current_workspace_id());
CREATE POLICY "tenant_isolation_enterprise_identities" ON "enterprise_identities"
USING (organization_id = app.current_organization_id() AND workspace_id = app.current_workspace_id())
WITH CHECK (organization_id = app.current_organization_id() AND workspace_id = app.current_workspace_id());
CREATE POLICY "tenant_isolation_oidc_login_states" ON "oidc_login_states"
USING (organization_id = app.current_organization_id() AND workspace_id = app.current_workspace_id())
WITH CHECK (organization_id = app.current_organization_id() AND workspace_id = app.current_workspace_id());
CREATE POLICY "tenant_isolation_scim_tokens" ON "scim_tokens"
USING (organization_id = app.current_organization_id() AND workspace_id = app.current_workspace_id())
WITH CHECK (organization_id = app.current_organization_id() AND workspace_id = app.current_workspace_id());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sessions_api') THEN
    GRANT SELECT,INSERT,UPDATE,DELETE ON enterprise_identity_providers,enterprise_identities,oidc_login_states,scim_tokens TO sessions_api;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sessions_worker') THEN
    GRANT SELECT,INSERT,UPDATE,DELETE ON enterprise_identity_providers,enterprise_identities,oidc_login_states,scim_tokens TO sessions_worker;
  END IF;
END $$;
