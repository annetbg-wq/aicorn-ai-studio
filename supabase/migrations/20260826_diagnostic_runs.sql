-- Diagnostic run / interactive pipeline execution primitives (Superadmin MCP, phase 2).
--
-- Dev/sandbox-only storage: a "run" is a diagnostic session; a "step" is one
-- captured LLM-call boundary from frontend/src/services/LLMProxy.ts's
-- diagnostic intercept. The browser (existing anon/authenticated Supabase
-- session, already used everywhere else in this app) INSERTs pending steps
-- and polls them; the MCP server (service-role key, bypasses RLS entirely)
-- reads/writes them to drive interactive execution. No production/customer
-- data lives here.

CREATE TABLE IF NOT EXISTS public.diagnostic_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text,
  status text NOT NULL DEFAULT 'created',
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT diagnostic_runs_status_check
    CHECK (status IN ('created', 'running', 'paused', 'stopped', 'completed', 'failed'))
);

CREATE TABLE IF NOT EXISTS public.diagnostic_run_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.diagnostic_runs(id) ON DELETE CASCADE,
  step_index int NOT NULL,
  step_name text NOT NULL DEFAULT 'unknown',
  status text NOT NULL DEFAULT 'pending',
  request_endpoint text,
  -- Captured LLM request headers with Authorization (the provider API key)
  -- always stripped by the frontend intercept before insert — never stored here.
  request_headers jsonb,
  request_body jsonb,
  proposed_result jsonb,
  validation jsonb,
  resolved_result jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT diagnostic_run_steps_status_check
    CHECK (status IN ('pending', 'proposed', 'validated', 'resolved', 'rejected')),
  CONSTRAINT diagnostic_run_steps_run_step_unique UNIQUE (run_id, step_index)
);

CREATE INDEX IF NOT EXISTS diagnostic_run_steps_run_id_idx ON public.diagnostic_run_steps (run_id);

GRANT SELECT, INSERT, UPDATE ON public.diagnostic_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.diagnostic_run_steps TO authenticated;
REVOKE ALL ON public.diagnostic_runs FROM anon;
REVOKE ALL ON public.diagnostic_run_steps FROM anon;

ALTER TABLE public.diagnostic_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diagnostic_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.diagnostic_run_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diagnostic_run_steps FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS diagnostic_runs_rw_authenticated ON public.diagnostic_runs;
CREATE POLICY diagnostic_runs_rw_authenticated
  ON public.diagnostic_runs
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS diagnostic_run_steps_rw_authenticated ON public.diagnostic_run_steps;
CREATE POLICY diagnostic_run_steps_rw_authenticated
  ON public.diagnostic_run_steps
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
