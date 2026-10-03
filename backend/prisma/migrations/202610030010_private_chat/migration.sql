ALTER TYPE "ChatChannel" ADD VALUE IF NOT EXISTS 'PRIVATE';

ALTER TABLE "chat_messages"
  ADD COLUMN "recipient_user_id" UUID;

ALTER TABLE "chat_messages"
  ADD CONSTRAINT "chat_messages_recipient_user_id_fkey"
    FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "chat_messages"
  ADD CONSTRAINT "chat_messages_private_recipient_check"
    CHECK (
      ("channel" = 'PRIVATE' AND "recipient_user_id" IS NOT NULL)
      OR
      ("channel" <> 'PRIVATE' AND "recipient_user_id" IS NULL)
    );

CREATE INDEX "chat_messages_session_id_recipient_user_id_created_at_idx"
  ON "chat_messages"("session_id", "recipient_user_id", "created_at");
