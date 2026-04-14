-- idea_feed_cache — stores pre-generated weekly/daily idea batches
-- Populated by the idea-cron Edge Function (run via pg_cron or manual invoke)
-- Read by the frontend ideaFeedService as a fast-path cache fallback.

CREATE TABLE IF NOT EXISTS idea_feed_cache (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_type   text        NOT NULL,   -- 'hot' | 'niches'
  week_key    text,                   -- ISO week string e.g. "2026-W15" (niches)
  date_key    text,                   -- ISO date string e.g. "2026-04-14" (hot)
  ideas       jsonb       NOT NULL DEFAULT '[]',
  model_used  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '8 days')
);

-- Unique index: only one active batch per feed_type + time window
CREATE UNIQUE INDEX IF NOT EXISTS idea_feed_cache_hot_uniq
  ON idea_feed_cache (feed_type, date_key)
  WHERE feed_type = 'hot' AND date_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idea_feed_cache_niches_uniq
  ON idea_feed_cache (feed_type, week_key)
  WHERE feed_type = 'niches' AND week_key IS NOT NULL;

-- RLS: public reads for non-expired rows; service role writes
ALTER TABLE idea_feed_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_non_expired" ON idea_feed_cache
  FOR SELECT USING (expires_at > now());

CREATE POLICY "service_insert" ON idea_feed_cache
  FOR INSERT WITH CHECK (true);

CREATE POLICY "service_delete" ON idea_feed_cache
  FOR DELETE USING (true);

-- Auto-cleanup expired rows
CREATE OR REPLACE FUNCTION cleanup_expired_idea_feed() RETURNS void
  LANGUAGE sql SECURITY DEFINER AS $$
    DELETE FROM idea_feed_cache WHERE expires_at < now();
  $$;
