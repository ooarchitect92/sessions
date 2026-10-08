-- Indexed lexical search for the Meeting Memory library.
--
-- The "simple" configuration intentionally avoids English-only stemming so that
-- workspace memory remains usable for multilingual transcripts. Tenant RLS still
-- applies; the application query also repeats organization/workspace predicates
-- as defense in depth.

CREATE INDEX "sessions_memory_fts_idx"
ON "sessions"
USING GIN (
  to_tsvector(
    'simple',
    COALESCE("title", '') || ' ' || COALESCE("description", '')
  )
);

CREATE INDEX "transcripts_memory_fts_idx"
ON "transcripts"
USING GIN (
  to_tsvector('simple', COALESCE("full_text", ''))
);
