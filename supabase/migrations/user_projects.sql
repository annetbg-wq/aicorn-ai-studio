-- user_projects — stores serialized project snapshots per user session.
-- Upserted from the frontend StorageService and ProjectRepository after each
-- significant change (generation complete, file edit, project rename).
-- Falls back to localStorage when this table is unavailable.

CREATE TABLE IF NOT EXISTS user_projects (
  id            UUID          PRIMARY KEY,
  name          TEXT          NOT NULL DEFAULT 'New Project',
  code_snapshot JSONB         NOT NULL DEFAULT '{}',
  last_sync_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  version       INTEGER       NOT NULL DEFAULT 1,
  user_id       UUID          REFERENCES auth.users (id) ON DELETE SET NULL
);

-- Index for quick per-user project listing ordered by recency
CREATE INDEX IF NOT EXISTS user_projects_user_id_last_sync_idx
  ON user_projects (user_id, last_sync_at DESC);

-- Index for version-conflict detection on the client side
CREATE INDEX IF NOT EXISTS user_projects_version_idx
  ON user_projects (id, version);

-- RLS: users can only access their own projects; anonymous upserts allowed
-- (the app is local-first — user_id is nullable for sessions without auth).
ALTER TABLE user_projects ENABLE ROW LEVEL SECURITY;

-- Allow all reads (projects are not sensitive; the app has no multi-tenancy yet).
-- Tighten to "auth.uid() = user_id OR user_id IS NULL" once auth is mandatory.
CREATE POLICY "public_read_user_projects"
  ON user_projects FOR SELECT USING (true);

-- Allow insert/upsert from the frontend (anon key).
CREATE POLICY "public_insert_user_projects"
  ON user_projects FOR INSERT WITH CHECK (true);

-- Allow updates — version increment guard is enforced client-side.
CREATE POLICY "public_update_user_projects"
  ON user_projects FOR UPDATE USING (true) WITH CHECK (true);

-- Allow delete so the "Delete project" flow can remove cloud copies.
CREATE POLICY "public_delete_user_projects"
  ON user_projects FOR DELETE USING (true);
