ALTER TYPE "ChatChannel" ADD VALUE IF NOT EXISTS 'DIRECT';

ALTER TABLE "chat_messages"
  ADD COLUMN "recipient_user_id" UUID;

ALTER TABLE "chat_messages"
  ADD CONSTRAINT "chat_messages_recipient_user_id_fkey"
  FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "chat_messages_session_id_recipient_user_id_created_at_idx"
  ON "chat_messages"("session_id", "recipient_user_id", "created_at");

ALTER TABLE "chat_messages"
  ADD CONSTRAINT "chat_messages_direct_recipient_check"
  CHECK (
    ("channel" = 'DIRECT' AND "recipient_user_id" IS NOT NULL)
    OR ("channel" <> 'DIRECT' AND "recipient_user_id" IS NULL)
  );

CREATE TABLE "chat_reactions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "message_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "emoji" VARCHAR(32) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_reactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chat_reactions_emoji_check" CHECK (char_length("emoji") BETWEEN 1 AND 32)
);

CREATE UNIQUE INDEX "chat_reactions_message_id_user_id_emoji_key"
  ON "chat_reactions"("message_id", "user_id", "emoji");
CREATE INDEX "chat_reactions_organization_id_workspace_id_session_id_created_at_idx"
  ON "chat_reactions"("organization_id", "workspace_id", "session_id", "created_at");

ALTER TABLE "chat_reactions"
  ADD CONSTRAINT "chat_reactions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_reactions"
  ADD CONSTRAINT "chat_reactions_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_reactions"
  ADD CONSTRAINT "chat_reactions_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "sessions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_reactions"
  ADD CONSTRAINT "chat_reactions_message_id_fkey"
  FOREIGN KEY ("message_id") REFERENCES "chat_messages"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_reactions"
  ADD CONSTRAINT "chat_reactions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "chat_reactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chat_reactions" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_chat_reactions" ON "chat_reactions"
  USING (
    organization_id = app.current_organization_id()
    AND workspace_id = app.current_workspace_id()
  )
  WITH CHECK (
    organization_id = app.current_organization_id()
    AND workspace_id = app.current_workspace_id()
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_api') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE chat_reactions TO sessions_api;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE chat_reactions TO sessions_worker;
  END IF;
END $$;
