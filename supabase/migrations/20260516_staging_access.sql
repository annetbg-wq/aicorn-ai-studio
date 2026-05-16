CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.staging_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  role text NOT NULL DEFAULT 'user',
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  revoked_at timestamptz,
  CONSTRAINT staging_access_status_check CHECK (status IN ('pending', 'approved', 'revoked')),
  CONSTRAINT staging_access_role_check CHECK (role IN ('user', 'admin'))
);

CREATE UNIQUE INDEX IF NOT EXISTS staging_access_email_lower_idx
  ON public.staging_access (lower(email));

GRANT SELECT, INSERT ON public.staging_access TO authenticated;
REVOKE ALL ON public.staging_access FROM anon;

ALTER TABLE public.staging_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staging_access FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staging_access_select_self ON public.staging_access;
DROP POLICY IF EXISTS staging_access_insert_pending_self ON public.staging_access;

CREATE POLICY staging_access_select_self
  ON public.staging_access
  FOR SELECT
  TO authenticated
  USING (lower(email) = lower(auth.jwt()->>'email'));

CREATE POLICY staging_access_insert_pending_self
  ON public.staging_access
  FOR INSERT
  TO authenticated
  WITH CHECK (
    lower(email) = lower(auth.jwt()->>'email')
    AND status = 'pending'
    AND role = 'user'
    AND approved_at IS NULL
    AND revoked_at IS NULL
  );
