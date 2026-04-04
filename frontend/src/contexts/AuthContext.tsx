import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, getUserFromSession, type SupabaseUser } from '../lib/supabase';

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
  const [user,              setUser]              = useState<SupabaseUser | null>(null);
  const [loading,           setLoading]           = useState(true);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);

  useEffect(() => {
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
        scopes: [
          'https://www.googleapis.com/auth/generative-language',
          'openid', 'email', 'profile',
        ].join(' '),
        queryParams: {
          access_type: 'offline',
          prompt:      'consent',
        },
      },
    });
  };

  const signOut = async () => {
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
