ALTER TABLE public.agent_sessions
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.agent_sessions
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS agent_sessions_user_idx
  ON public.agent_sessions(user_id);

DROP POLICY IF EXISTS "auth read" ON public.agent_sessions;
DROP POLICY IF EXISTS "auth write" ON public.agent_sessions;

DROP POLICY IF EXISTS agent_sessions_select ON public.agent_sessions;
DROP POLICY IF EXISTS agent_sessions_insert ON public.agent_sessions;
DROP POLICY IF EXISTS agent_sessions_update ON public.agent_sessions;
DROP POLICY IF EXISTS agent_sessions_delete ON public.agent_sessions;

CREATE POLICY agent_sessions_select
  ON public.agent_sessions
  FOR SELECT
  TO authenticated
  USING (user_id IS NULL OR auth.uid() = user_id);

CREATE POLICY agent_sessions_insert
  ON public.agent_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY agent_sessions_update
  ON public.agent_sessions
  FOR UPDATE
  TO authenticated
  USING (user_id IS NULL OR auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY agent_sessions_delete
  ON public.agent_sessions
  FOR DELETE
  TO authenticated
  USING (user_id IS NULL OR auth.uid() = user_id);
