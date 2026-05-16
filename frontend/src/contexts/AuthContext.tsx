import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, getUserFromSession, type SupabaseUser } from '../lib/supabase';
import {
  DEV_BYPASS_KEY,
  canUseDevAuthBypass,
  isFounderAdminEmail,
  normalizeEmail,
} from '../services/internalAccess';

export type AccessStatus = 'pending' | 'approved' | 'revoked' | 'unknown';

type StagingAccessRole = 'user' | 'admin';

interface StagingAccessRow {
  email: string;
  status: AccessStatus;
  role: StagingAccessRole;
}

function hasDevBypass(): boolean {
  try {
    return canUseDevAuthBypass();
  } catch {
    return false;
  }
}

function hasPrivilegedAuthRole(role?: string | null): boolean {
  const normalizedRole = String(role ?? '').trim().toLowerCase();
  return normalizedRole === 'admin'
    || normalizedRole === 'creator'
    || normalizedRole === 'founder';
}

function normalizeAccessStatus(status?: string | null): AccessStatus {
  if (status === 'pending' || status === 'approved' || status === 'revoked') {
    return status;
  }
  return 'unknown';
}

function normalizeAccessRole(role?: string | null): StagingAccessRole {
  return String(role ?? '').trim().toLowerCase() === 'admin' ? 'admin' : 'user';
}

function mapStagingAccessRow(row: Record<string, unknown>): StagingAccessRow {
  return {
    email: String(row.email ?? ''),
    status: normalizeAccessStatus(String(row.status ?? 'unknown')),
    role: normalizeAccessRole(String(row.role ?? 'user')),
  };
}

async function readOwnStagingAccess(): Promise<StagingAccessRow | null> {
  const { data, error } = await supabase
    .from('staging_access')
    .select('email, status, role')
    .maybeSingle();

  if (error) throw error;
  return data ? mapStagingAccessRow(data as Record<string, unknown>) : null;
}

async function createPendingStagingAccess(email: string): Promise<StagingAccessRow> {
  const { data, error } = await supabase
    .from('staging_access')
    .insert({ email, status: 'pending', role: 'user' })
    .select('email, status, role')
    .single();

  if (error) {
    if (error.code === '23505') {
      const existingRow = await readOwnStagingAccess();
      if (existingRow) return existingRow;
    }
    throw error;
  }

  return mapStagingAccessRow(data as Record<string, unknown>);
}

async function getOrCreateOwnStagingAccess(email: string): Promise<StagingAccessRow> {
  const existingRow = await readOwnStagingAccess();
  if (existingRow) return existingRow;
  return createPendingStagingAccess(email);
}

function makeDevUser(): SupabaseUser {
  return {
    id: 'dev-bypass-user',
    email: 'dev.local@aic-studio.test',
    app_metadata: { provider: 'dev-bypass' },
    user_metadata: { full_name: 'Local Dev User' },
    aud: 'authenticated',
    created_at: new Date(0).toISOString(),
    role: 'admin',
  } as SupabaseUser;
}

interface AuthContextValue {
  user:               SupabaseUser | null;
  loading:            boolean;
  isAdmin:            boolean;
  isAccessApproved:   boolean;
  accessStatus:       AccessStatus;
  signInWithGoogle:   () => Promise<void>;
  signOut:            () => Promise<void>;
  googleAccessToken:  string | null;
}

const AuthContext = createContext<AuthContextValue>({
  user: null, loading: true,
  isAdmin: false,
  isAccessApproved: false,
  accessStatus: 'unknown',
  signInWithGoogle: async () => {},
  signOut: async () => {},
  googleAccessToken: null,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user,              setUser]              = useState<SupabaseUser | null>(hasDevBypass() ? makeDevUser() : null);
  const [loading,           setLoading]           = useState(true);
  const [isAdmin,           setIsAdmin]           = useState(hasDevBypass());
  const [accessStatus,      setAccessStatus]      = useState<AccessStatus>(hasDevBypass() ? 'approved' : 'unknown');
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const resolveSessionAccess = async (session: unknown) => {
      const nextUser = getUserFromSession(session);
      if (cancelled) return;

      setUser(nextUser);
      setGoogleAccessToken((session as { provider_token?: string | null } | null)?.provider_token ?? null);

      if (!nextUser) {
        setIsAdmin(false);
        setAccessStatus('unknown');
        setLoading(false);
        return;
      }

      if (isFounderAdminEmail(nextUser.email) || hasPrivilegedAuthRole(nextUser.role)) {
        setIsAdmin(true);
        setAccessStatus('approved');
        setLoading(false);
        return;
      }

      const normalizedEmail = normalizeEmail(nextUser.email);
      if (!normalizedEmail) {
        console.error('[Auth] Unable to resolve staging access: authenticated user has no email.');
        setIsAdmin(false);
        setAccessStatus('unknown');
        setLoading(false);
        return;
      }

      try {
        const accessRow = await getOrCreateOwnStagingAccess(normalizedEmail);
        if (cancelled) return;

        if (accessRow.status === 'revoked') {
          setIsAdmin(false);
          setAccessStatus('revoked');
          setLoading(false);
          return;
        }

        const rowApproved = accessRow.status === 'approved';
        const rowIsAdmin = accessRow.role === 'admin' && rowApproved;
        setIsAdmin(rowIsAdmin);
        setAccessStatus(rowApproved ? 'approved' : accessRow.status);
      } catch (error) {
        console.error('[Auth] Failed to resolve staging access.', error);
        if (cancelled) return;
        setIsAdmin(false);
        setAccessStatus('unknown');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    if (hasDevBypass()) {
      setUser(makeDevUser());
      setIsAdmin(true);
      setAccessStatus('approved');
      setGoogleAccessToken(null);
      setLoading(false);
      return;
    }

    void supabase.auth.getSession()
      .then(({ data: { session } }) => resolveSessionAccess(session))
      .catch((error) => {
        console.error('[Auth] Failed to load Supabase session.', error);
        if (cancelled) return;
        setUser(null);
        setIsAdmin(false);
        setAccessStatus('unknown');
        setGoogleAccessToken(null);
        setLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setLoading(true);
        void resolveSessionAccess(session);
      }
    );

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        scopes: 'email profile',
        queryParams: {
          access_type: 'offline',
          prompt:      'consent',
        },
      },
    });
  };

  const signOut = async () => {
    try {
      localStorage.removeItem(DEV_BYPASS_KEY);
    } catch {
      // ignore storage failures
    }
    await supabase.auth.signOut();
    setUser(null);
    setIsAdmin(false);
    setAccessStatus('unknown');
    setGoogleAccessToken(null);
  };

  const isAccessApproved = isAdmin || accessStatus === 'approved';

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      isAdmin,
      isAccessApproved,
      accessStatus,
      signInWithGoogle,
      signOut,
      googleAccessToken,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
