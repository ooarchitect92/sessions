CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'LIVE', 'ENDED', 'CANCELLED');
CREATE TYPE "RegistrationStatus" AS ENUM ('REGISTERED', 'WAITLISTED', 'CANCELLED', 'ATTENDED', 'NO_SHOW');
CREATE TYPE "BookingStatus" AS ENUM ('CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');
CREATE TYPE "ArtifactStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED', 'DELETING', 'DELETED');
CREATE TYPE "ChatChannel" AS ENUM ('EVERYONE', 'HOSTS');
CREATE TYPE "PollType" AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'OPEN_TEXT', 'NPS', 'WORD_CLOUD');
CREATE TYPE "PollStatus" AS ENUM ('DRAFT', 'LIVE', 'CLOSED');
CREATE TYPE "QuestionStatus" AS ENUM ('PENDING', 'APPROVED', 'ANSWERED', 'HIDDEN');

CREATE TABLE "events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "created_by_id" UUID NOT NULL,
  "session_id" UUID,
  "slug" VARCHAR(100) NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "description" TEXT,
  "starts_at" TIMESTAMPTZ(6) NOT NULL,
  "duration_minutes" INTEGER NOT NULL,
  "timezone" VARCHAR(100) NOT NULL,
  "capacity" INTEGER,
  "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
  "registration_fields" JSONB NOT NULL DEFAULT '[]',
  "branding" JSONB NOT NULL DEFAULT '{}',
  "published_at" TIMESTAMPTZ(6),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "events_duration_check" CHECK ("duration_minutes" BETWEEN 5 AND 1440),
  CONSTRAINT "events_capacity_check" CHECK ("capacity" IS NULL OR "capacity" > 0),
  CONSTRAINT "events_version_check" CHECK ("version" > 0)
);

CREATE TABLE "event_registrations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "email" CITEXT NOT NULL,
  "answers" JSONB NOT NULL DEFAULT '{}',
  "status" "RegistrationStatus" NOT NULL DEFAULT 'REGISTERED',
  "registered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "checked_in_at" TIMESTAMPTZ(6),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_registrations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "booking_pages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "created_by_id" UUID NOT NULL,
  "slug" VARCHAR(100) NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "description" TEXT,
  "duration_minutes" INTEGER NOT NULL,
  "timezone" VARCHAR(100) NOT NULL,
  "minimum_notice_minutes" INTEGER NOT NULL DEFAULT 60,
  "buffer_before_minutes" INTEGER NOT NULL DEFAULT 0,
  "buffer_after_minutes" INTEGER NOT NULL DEFAULT 0,
  "availability_rules" JSONB NOT NULL DEFAULT '[]',
  "intake_fields" JSONB NOT NULL DEFAULT '[]',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "booking_pages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "booking_pages_duration_check" CHECK ("duration_minutes" BETWEEN 5 AND 480),
  CONSTRAINT "booking_pages_notice_check" CHECK ("minimum_notice_minutes" >= 0),
  CONSTRAINT "booking_pages_buffers_check" CHECK ("buffer_before_minutes" >= 0 AND "buffer_after_minutes" >= 0),
  CONSTRAINT "booking_pages_version_check" CHECK ("version" > 0)
);

CREATE TABLE "booking_reservations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "booking_page_id" UUID NOT NULL,
  "session_id" UUID,
  "name" VARCHAR(160) NOT NULL,
  "email" CITEXT NOT NULL,
  "starts_at" TIMESTAMPTZ(6) NOT NULL,
  "ends_at" TIMESTAMPTZ(6) NOT NULL,
  "timezone" VARCHAR(100) NOT NULL,
  "answers" JSONB NOT NULL DEFAULT '{}',
  "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "booking_reservations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "booking_reservations_time_check" CHECK ("ends_at" > "starts_at")
);

CREATE TABLE "recordings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "status" "ArtifactStatus" NOT NULL DEFAULT 'PENDING',
  "provider" VARCHAR(100),
  "provider_job_id" VARCHAR(255),
  "object_key" TEXT,
  "playback_object_key" TEXT,
  "duration_seconds" INTEGER,
  "started_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "failure_code" VARCHAR(160),
  "consent_snapshot" JSONB NOT NULL DEFAULT '{}',
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recordings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "recordings_duration_check" CHECK ("duration_seconds" IS NULL OR "duration_seconds" >= 0),
  CONSTRAINT "recordings_version_check" CHECK ("version" > 0)
);

CREATE TABLE "transcripts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "recording_id" UUID,
  "status" "ArtifactStatus" NOT NULL DEFAULT 'PENDING',
  "language" VARCHAR(32),
  "provider" VARCHAR(100),
  "object_key" TEXT,
  "full_text" TEXT,
  "completed_at" TIMESTAMPTZ(6),
  "failure_code" VARCHAR(160),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "transcripts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "transcripts_version_check" CHECK ("version" > 0)
);

CREATE TABLE "transcript_segments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "transcript_id" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  "start_ms" INTEGER NOT NULL,
  "end_ms" INTEGER NOT NULL,
  "speaker_label" VARCHAR(160),
  "text" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "transcript_segments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "transcript_segments_position_check" CHECK ("position" >= 0),
  CONSTRAINT "transcript_segments_time_check" CHECK ("start_ms" >= 0 AND "end_ms" >= "start_ms")
);

CREATE TABLE "memory_summaries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "status" "ArtifactStatus" NOT NULL DEFAULT 'PENDING',
  "provider" VARCHAR(100),
  "model" VARCHAR(160),
  "summary_text" TEXT,
  "decisions" JSONB NOT NULL DEFAULT '[]',
  "action_items" JSONB NOT NULL DEFAULT '[]',
  "citations" JSONB NOT NULL DEFAULT '[]',
  "completed_at" TIMESTAMPTZ(6),
  "failure_code" VARCHAR(160),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "memory_summaries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "memory_summaries_version_check" CHECK ("version" > 0)
);

CREATE TABLE "chat_messages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "author_user_id" UUID NOT NULL,
  "channel" "ChatChannel" NOT NULL DEFAULT 'EVERYONE',
  "body" TEXT NOT NULL,
  "edited_at" TIMESTAMPTZ(6),
  "deleted_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chat_messages_body_check" CHECK (char_length("body") BETWEEN 1 AND 5000)
);

CREATE TABLE "polls" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "created_by_id" UUID NOT NULL,
  "question" TEXT NOT NULL,
  "type" "PollType" NOT NULL,
  "status" "PollStatus" NOT NULL DEFAULT 'DRAFT',
  "anonymous" BOOLEAN NOT NULL DEFAULT false,
  "launched_at" TIMESTAMPTZ(6),
  "closed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "polls_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "polls_question_check" CHECK (char_length("question") BETWEEN 1 AND 1000)
);

CREATE TABLE "poll_options" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "poll_id" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  "label" VARCHAR(500) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "poll_options_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "poll_options_position_check" CHECK ("position" >= 0)
);

CREATE TABLE "poll_answers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "poll_id" UUID NOT NULL,
  "respondent_key" VARCHAR(200) NOT NULL,
  "respondent_user_id" UUID,
  "selected_option_ids" JSONB NOT NULL DEFAULT '[]',
  "text_answer" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "poll_answers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "questions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "author_user_id" UUID,
  "author_display_name" VARCHAR(160),
  "body" TEXT NOT NULL,
  "status" "QuestionStatus" NOT NULL DEFAULT 'PENDING',
  "is_anonymous" BOOLEAN NOT NULL DEFAULT false,
  "answer_text" TEXT,
  "answered_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "questions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "questions_body_check" CHECK (char_length("body") BETWEEN 1 AND 5000)
);

CREATE TABLE "question_votes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "question_id" UUID NOT NULL,
  "voter_key" VARCHAR(200) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "question_votes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "events_session_id_key" ON "events"("session_id");
CREATE UNIQUE INDEX "events_workspace_id_slug_key" ON "events"("workspace_id", "slug");
CREATE INDEX "events_organization_id_workspace_id_starts_at_idx" ON "events"("organization_id", "workspace_id", "starts_at");
CREATE INDEX "events_workspace_id_status_starts_at_idx" ON "events"("workspace_id", "status", "starts_at");
CREATE UNIQUE INDEX "event_registrations_event_id_email_key" ON "event_registrations"("event_id", "email");
CREATE INDEX "event_registrations_organization_id_workspace_id_event_id_idx" ON "event_registrations"("organization_id", "workspace_id", "event_id");
CREATE INDEX "event_registrations_event_id_status_registered_at_idx" ON "event_registrations"("event_id", "status", "registered_at");
CREATE UNIQUE INDEX "booking_pages_workspace_id_slug_key" ON "booking_pages"("workspace_id", "slug");
CREATE INDEX "booking_pages_organization_id_workspace_id_active_idx" ON "booking_pages"("organization_id", "workspace_id", "active");
CREATE UNIQUE INDEX "booking_reservations_booking_page_id_starts_at_key" ON "booking_reservations"("booking_page_id", "starts_at");
CREATE INDEX "booking_reservations_organization_id_workspace_id_starts_at_idx" ON "booking_reservations"("organization_id", "workspace_id", "starts_at");
CREATE INDEX "booking_reservations_booking_page_id_status_starts_at_idx" ON "booking_reservations"("booking_page_id", "status", "starts_at");
CREATE UNIQUE INDEX "recordings_session_id_key" ON "recordings"("session_id");
CREATE INDEX "recordings_organization_id_workspace_id_status_idx" ON "recordings"("organization_id", "workspace_id", "status");
CREATE UNIQUE INDEX "transcripts_session_id_key" ON "transcripts"("session_id");
CREATE UNIQUE INDEX "transcripts_recording_id_key" ON "transcripts"("recording_id");
CREATE INDEX "transcripts_organization_id_workspace_id_status_idx" ON "transcripts"("organization_id", "workspace_id", "status");
CREATE UNIQUE INDEX "transcript_segments_transcript_id_position_key" ON "transcript_segments"("transcript_id", "position");
CREATE INDEX "transcript_segments_organization_id_workspace_id_transcript_id_idx" ON "transcript_segments"("organization_id", "workspace_id", "transcript_id");
CREATE UNIQUE INDEX "memory_summaries_session_id_key" ON "memory_summaries"("session_id");
CREATE INDEX "memory_summaries_organization_id_workspace_id_status_idx" ON "memory_summaries"("organization_id", "workspace_id", "status");
CREATE INDEX "chat_messages_organization_id_workspace_id_session_id_created_at_idx" ON "chat_messages"("organization_id", "workspace_id", "session_id", "created_at");
CREATE INDEX "polls_organization_id_workspace_id_session_id_status_idx" ON "polls"("organization_id", "workspace_id", "session_id", "status");
CREATE UNIQUE INDEX "poll_options_poll_id_position_key" ON "poll_options"("poll_id", "position");
CREATE INDEX "poll_options_organization_id_workspace_id_poll_id_idx" ON "poll_options"("organization_id", "workspace_id", "poll_id");
CREATE UNIQUE INDEX "poll_answers_poll_id_respondent_key_key" ON "poll_answers"("poll_id", "respondent_key");
CREATE INDEX "poll_answers_organization_id_workspace_id_poll_id_idx" ON "poll_answers"("organization_id", "workspace_id", "poll_id");
CREATE INDEX "questions_organization_id_workspace_id_session_id_status_created_at_idx" ON "questions"("organization_id", "workspace_id", "session_id", "status", "created_at");
CREATE UNIQUE INDEX "question_votes_question_id_voter_key_key" ON "question_votes"("question_id", "voter_key");
CREATE INDEX "question_votes_organization_id_workspace_id_question_id_idx" ON "question_votes"("organization_id", "workspace_id", "question_id");

ALTER TABLE "events" ADD CONSTRAINT "events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "events" ADD CONSTRAINT "events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "events" ADD CONSTRAINT "events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_pages" ADD CONSTRAINT "booking_pages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_pages" ADD CONSTRAINT "booking_pages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_pages" ADD CONSTRAINT "booking_pages_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "booking_reservations" ADD CONSTRAINT "booking_reservations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_reservations" ADD CONSTRAINT "booking_reservations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_reservations" ADD CONSTRAINT "booking_reservations_booking_page_id_fkey" FOREIGN KEY ("booking_page_id") REFERENCES "booking_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_reservations" ADD CONSTRAINT "booking_reservations_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_recording_id_fkey" FOREIGN KEY ("recording_id") REFERENCES "recordings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_transcript_id_fkey" FOREIGN KEY ("transcript_id") REFERENCES "transcripts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memory_summaries" ADD CONSTRAINT "memory_summaries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memory_summaries" ADD CONSTRAINT "memory_summaries_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memory_summaries" ADD CONSTRAINT "memory_summaries_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "polls" ADD CONSTRAINT "polls_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "polls" ADD CONSTRAINT "polls_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "polls" ADD CONSTRAINT "polls_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "polls" ADD CONSTRAINT "polls_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "poll_options" ADD CONSTRAINT "poll_options_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "poll_options" ADD CONSTRAINT "poll_options_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "poll_options" ADD CONSTRAINT "poll_options_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "poll_answers" ADD CONSTRAINT "poll_answers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "poll_answers" ADD CONSTRAINT "poll_answers_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "poll_answers" ADD CONSTRAINT "poll_answers_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "questions" ADD CONSTRAINT "questions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "questions" ADD CONSTRAINT "questions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "questions" ADD CONSTRAINT "questions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "questions" ADD CONSTRAINT "questions_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "question_votes" ADD CONSTRAINT "question_votes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "question_votes" ADD CONSTRAINT "question_votes_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "question_votes" ADD CONSTRAINT "question_votes_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DO $$
DECLARE
  tenant_table TEXT;
BEGIN
  FOREACH tenant_table IN ARRAY ARRAY[
    'events', 'event_registrations', 'booking_pages', 'booking_reservations',
    'recordings', 'transcripts', 'transcript_segments', 'memory_summaries',
    'chat_messages', 'polls', 'poll_options', 'poll_answers', 'questions', 'question_votes'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (organization_id = app.current_organization_id() AND workspace_id = app.current_workspace_id()) WITH CHECK (organization_id = app.current_organization_id() AND workspace_id = app.current_workspace_id())',
      'tenant_isolation_' || tenant_table,
      tenant_table
    );
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_api') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
      events, event_registrations, booking_pages, booking_reservations,
      recordings, transcripts, transcript_segments, memory_summaries,
      chat_messages, polls, poll_options, poll_answers, questions, question_votes
    TO sessions_api;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sessions_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
      events, event_registrations, booking_pages, booking_reservations,
      recordings, transcripts, transcript_segments, memory_summaries,
      chat_messages, polls, poll_options, poll_answers, questions, question_votes
    TO sessions_worker;
  END IF;
END $$;
