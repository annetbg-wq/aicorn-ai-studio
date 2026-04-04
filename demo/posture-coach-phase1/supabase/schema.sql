-- ============================================================
-- AI Posture Coach — Phase 1 Database Schema
-- Run this in: Supabase Dashboard → SQL Editor → Paste → Run
-- ============================================================

-- ── posture_sessions ──────────────────────────────────────────
-- One row per continuous monitoring session (user opens tab → closes tab)

CREATE TABLE posture_sessions (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at              TIMESTAMPTZ,
  duration_seconds      INTEGER     DEFAULT 0,
  snapshot_count        INTEGER     DEFAULT 0,
  good_posture_seconds  INTEGER     DEFAULT 0,
  bad_posture_seconds   INTEGER     DEFAULT 0,
  avg_score             NUMERIC(5,2) DEFAULT 0,   -- 0.00 – 100.00
  alert_count           INTEGER     DEFAULT 0
);

CREATE INDEX ON posture_sessions(user_id, started_at DESC);

ALTER TABLE posture_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users own sessions"
  ON posture_sessions FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── posture_snapshots ─────────────────────────────────────────
-- One row per webcam snapshot analysis result

CREATE TABLE posture_snapshots (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID        NOT NULL REFERENCES posture_sessions(id) ON DELETE CASCADE,
  captured_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  score         INTEGER     CHECK (score BETWEEN 0 AND 100),
  issues        TEXT[]      DEFAULT '{}',  -- ["Neck forward", "Shoulders raised"]
  tips          TEXT[]      DEFAULT '{}',  -- corrective suggestions
  confidence    TEXT        DEFAULT 'medium' CHECK (confidence IN ('high','medium','low')),
  image_url     TEXT        -- optional: Supabase Storage URL if storing snapshots
);

CREATE INDEX ON posture_snapshots(session_id, captured_at DESC);

ALTER TABLE posture_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users own snapshots"
  ON posture_snapshots FOR ALL
  USING (
    session_id IN (SELECT id FROM posture_sessions WHERE user_id = auth.uid())
  );

-- ── posture_streaks ───────────────────────────────────────────
-- Gamification: consecutive days with ≥60% good posture time

CREATE TABLE posture_streaks (
  id              UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID  NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  current_streak  INTEGER DEFAULT 0,
  longest_streak  INTEGER DEFAULT 0,
  last_good_day   DATE,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE posture_streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users own streaks"
  ON posture_streaks FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── posture_daily_summaries ───────────────────────────────────
-- Materialized per-day stats (updated on session end)

CREATE TABLE posture_daily_summaries (
  id             UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID  NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day            DATE  NOT NULL,
  total_minutes  INTEGER DEFAULT 0,
  good_minutes   INTEGER DEFAULT 0,
  avg_score      NUMERIC(5,2) DEFAULT 0,
  session_count  INTEGER DEFAULT 0,
  UNIQUE (user_id, day)
);

CREATE INDEX ON posture_daily_summaries(user_id, day DESC);

ALTER TABLE posture_daily_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users own daily summaries"
  ON posture_daily_summaries FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Supabase Storage bucket (optional) ───────────────────────
-- Only needed if you want to store webcam snapshots for history.
--
-- Setup (Supabase Dashboard → Storage → New Bucket):
--   Name:    posture-snapshots
--   Public:  NO  (private bucket — access via signed URLs)
--   Max size: 2 MB per file (JPEG snapshots are ~50-100 KB each)
--
-- RLS for storage (run in SQL Editor after creating bucket):
-- CREATE POLICY "users own snapshots"
--   ON storage.objects FOR ALL
--   USING  (bucket_id = 'posture-snapshots' AND auth.uid()::text = (storage.foldername(name))[1])
--   WITH CHECK (bucket_id = 'posture-snapshots' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ── Seed data (2 example sessions for UI testing) ────────────
-- Remove before production. Requires a valid user_id.
--
-- INSERT INTO posture_sessions (user_id, started_at, ended_at, duration_seconds, avg_score, good_posture_seconds, bad_posture_seconds, snapshot_count)
-- VALUES
--   ('00000000-0000-0000-0000-000000000001', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour', 3600, 76.5, 2880, 720, 60),
--   ('00000000-0000-0000-0000-000000000001', NOW() - INTERVAL '30 minutes', NULL, 0, 0, 0, 0, 0);
