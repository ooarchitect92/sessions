CREATE TABLE "agenda_templates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "created_by_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "description" VARCHAR(1000),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agenda_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agenda_templates_version_check" CHECK ("version" > 0),
  CONSTRAINT "agenda_templates_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "agenda_templates_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "agenda_templates_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "agenda_template_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "template_id" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "duration_seconds" INTEGER NOT NULL,
  "type" "AgendaItemType" NOT NULL,
  "content" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agenda_template_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agenda_template_items_position_check" CHECK ("position" >= 0),
  CONSTRAINT "agenda_template_items_duration_check"
    CHECK ("duration_seconds" BETWEEN 0 AND 86400),
  CONSTRAINT "agenda_template_items_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "agenda_template_items_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "agenda_template_items_template_id_fkey"
    FOREIGN KEY ("template_id") REFERENCES "agenda_templates"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "agenda_templates_workspace_id_name_key"
  ON "agenda_templates"("workspace_id", "name");

CREATE INDEX "agenda_templates_organization_id_workspace_id_created_at_idx"
  ON "agenda_templates"("organization_id", "workspace_id", "created_at");

CREATE UNIQUE INDEX "agenda_template_items_template_id_position_key"
  ON "agenda_template_items"("template_id", "position");

CREATE INDEX "agenda_template_items_organization_id_workspace_id_template_id_idx"
  ON "agenda_template_items"("organization_id", "workspace_id", "template_id");

ALTER TABLE "agenda_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agenda_templates" FORCE ROW LEVEL SECURITY;
ALTER TABLE "agenda_template_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agenda_template_items" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_agenda_templates" ON "agenda_templates"
  USING (
    "organization_id" = app.current_organization_id()
    AND "workspace_id" = app.current_workspace_id()
  )
  WITH CHECK (
    "organization_id" = app.current_organization_id()
    AND "workspace_id" = app.current_workspace_id()
  );

CREATE POLICY "tenant_isolation_agenda_template_items" ON "agenda_template_items"
  USING (
    "organization_id" = app.current_organization_id()
    AND "workspace_id" = app.current_workspace_id()
  )
  WITH CHECK (
    "organization_id" = app.current_organization_id()
    AND "workspace_id" = app.current_workspace_id()
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_api') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
      agenda_templates, agenda_template_items
    TO sessions_api;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
      agenda_templates, agenda_template_items
    TO sessions_worker;
  END IF;
END $$;
