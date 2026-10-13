-- Security hardening for legacy public.projects snapshot storage.
-- Applied to production Supabase on 2026-10-13 as
-- secure_projects_snapshots_owner_rls_20261013.
-- Re-runnable for environments that were deployed from this repository.
-- Existing 8 legacy ownerless snapshots are kept, accessible by trusted service_role.
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS owner_id uuid;
CREATE INDEX IF NOT EXISTS projects_owner_id_idx ON public.projects(owner_id);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.projects FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.projects FROM authenticated;
GRANT SELECT, INSERT ON TABLE public.projects TO authenticated;

DROP POLICY IF EXISTS projects_owner_select ON public.projects;
DROP POLICY IF EXISTS projects_owner_insert ON public.projects;

CREATE POLICY projects_owner_select ON public.projects
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = owner_id);

CREATE POLICY projects_owner_insert ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = owner_id);
