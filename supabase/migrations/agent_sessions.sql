-- Agent Sessions — autonomous multi-agent development loop
-- Status flow: pending → spec_review → building → qa_review → ready → applied / rejected

CREATE TABLE IF NOT EXISTS agent_sessions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  block_name      TEXT        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'pending',
  spec            JSONB,
  iterations      INTEGER     DEFAULT 0,
  max_iterations  INTEGER     DEFAULT 5,
  isolated_files  JSONB,   -- snapshot of project files at session start
  result_files    JSONB,   -- output files after build
  qa_report       JSONB,
  review_report   TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read"  ON agent_sessions FOR SELECT USING (true);
CREATE POLICY "auth write" ON agent_sessions FOR ALL    USING (true);
