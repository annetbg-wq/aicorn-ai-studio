import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, getUserFromSession, type SupabaseUser } from '../lib/supabase';

const DEV_BYPASS_KEY = 'AIC_DEV_AUTH_BYPASS';

function isLocalDevHost(): boolean {
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

function hasDevBypass(): boolean {
  try {
    return isLocalDevHost() && localStorage.getItem(DEV_BYPASS_KEY) === '1';
  } catch {
    return false;
  }
}

function makeDevUser(): SupabaseUser {
  return {
    id: 'dev-bypass-user',
    email: 'dev.local@aic-studio.test',
    app_metadata: { provider: 'dev-bypass' },
    user_metadata: { full_name: 'Local Dev User' },
    aud: 'authenticated',
    created_at: new Date(0).toISOString(),
  } as SupabaseUser;
}

interface AuthContextValue {
  user:               SupabaseUser | null;
  loading:            boolean;
  signInWithGoogle:   () => Promise<void>;
  signOut:            () => Promise<void>;
  googleAccessToken:  string | null;
}

const AuthContext = createContext<AuthContextValue>({
  user: null, loading: true,
  signInWithGoogle: async () => {},
  signOut: async () => {},
  googleAccessToken: null,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user,              setUser]              = useState<SupabaseUser | null>(hasDevBypass() ? makeDevUser() : null);
  const [loading,           setLoading]           = useState(true);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);

  useEffect(() => {
    if (hasDevBypass()) {
      setUser(makeDevUser());
      setGoogleAccessToken(null);
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(getUserFromSession(session));
      setGoogleAccessToken(session?.provider_token ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(getUserFromSession(session));
        setGoogleAccessToken(session?.provider_token ?? null);
      }
    );

    return () => subscription.unsubscribe();
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
    setGoogleAccessToken(null);
  };

  return (
    <AuthContext.Provider value={{
      user, loading, signInWithGoogle, signOut, googleAccessToken,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
