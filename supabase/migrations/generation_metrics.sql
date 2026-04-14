-- Generation Metrics — per-run telemetry for AI generation pipeline
-- Inserted fire-and-forget from MetricsService.logGeneration() after each run.
-- Used for dashboards, quality tracking, and failure analysis.

CREATE TABLE IF NOT EXISTS generation_metrics (
  generation_id   UUID        PRIMARY KEY,
  intent          TEXT        NOT NULL,          -- truncated to 200 chars client-side
  model_id        TEXT        NOT NULL,
  duration_ms     INTEGER     NOT NULL,
  file_count      INTEGER     NOT NULL DEFAULT 0,
  parse_success   BOOLEAN     NOT NULL DEFAULT false,
  fallback_used   BOOLEAN     NOT NULL DEFAULT false,
  compile_success BOOLEAN     NOT NULL DEFAULT false,
  autofix_needed  BOOLEAN     NOT NULL DEFAULT false,
  autofix_success BOOLEAN     NOT NULL DEFAULT false,
  error_message   TEXT,                          -- null on success
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for dashboard queries: recent runs + failure filtering
CREATE INDEX IF NOT EXISTS generation_metrics_created_at_idx
  ON generation_metrics (created_at DESC);

CREATE INDEX IF NOT EXISTS generation_metrics_model_id_idx
  ON generation_metrics (model_id);

-- RLS: public read, authenticated write (same pattern as agent_sessions)
ALTER TABLE generation_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read generation_metrics"
  ON generation_metrics FOR SELECT USING (true);

CREATE POLICY "public insert generation_metrics"
  ON generation_metrics FOR INSERT WITH CHECK (true);
