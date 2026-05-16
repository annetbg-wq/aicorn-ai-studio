ALTER TABLE public.user_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_read_user_projects ON public.user_projects;
DROP POLICY IF EXISTS public_insert_user_projects ON public.user_projects;
DROP POLICY IF EXISTS public_update_user_projects ON public.user_projects;
DROP POLICY IF EXISTS public_delete_user_projects ON public.user_projects;

DROP POLICY IF EXISTS "public_read_user_projects" ON public.user_projects;
DROP POLICY IF EXISTS "public_insert_user_projects" ON public.user_projects;
DROP POLICY IF EXISTS "public_update_user_projects" ON public.user_projects;
DROP POLICY IF EXISTS "public_delete_user_projects" ON public.user_projects;

DROP POLICY IF EXISTS user_read_own_projects ON public.user_projects;
DROP POLICY IF EXISTS user_insert_own_projects ON public.user_projects;
DROP POLICY IF EXISTS user_update_own_projects ON public.user_projects;
DROP POLICY IF EXISTS user_delete_own_projects ON public.user_projects;

CREATE POLICY user_read_own_projects
  ON public.user_projects
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY user_insert_own_projects
  ON public.user_projects
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_update_own_projects
  ON public.user_projects
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_delete_own_projects
  ON public.user_projects
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
