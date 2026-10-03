CREATE TYPE "AgendaTimerStatus" AS ENUM ('IDLE', 'RUNNING', 'PAUSED', 'EXPIRED');

ALTER TABLE "sessions"
  ADD COLUMN "agenda_timer_status" "AgendaTimerStatus" NOT NULL DEFAULT 'IDLE',
  ADD COLUMN "agenda_timer_remaining_seconds" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "agenda_timer_ends_at" TIMESTAMPTZ(6),
  ADD COLUMN "agenda_timer_started_at" TIMESTAMPTZ(6);

ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_agenda_timer_remaining_seconds_check"
    CHECK ("agenda_timer_remaining_seconds" >= 0);
