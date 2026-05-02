import React, { createContext, useContext, useState, useEffect } from 'react';

interface User { id: string; email: string; name?: string; avatar?: string; }
interface AuthContextType { user: User | null; signIn: () => void; signOut: () => void; }

const AuthContext = createContext<AuthContextType>({ user: null, signIn: () => {}, signOut: () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('user_profile');
      if (stored) setUser(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  const signIn = () => {
    const mockUser: User = { id: crypto.randomUUID(), email: 'user@example.com', name: 'Пользователь' };
    localStorage.setItem('user_profile', JSON.stringify(mockUser));
    setUser(mockUser);
  };

  const signOut = () => {
    localStorage.removeItem('user_profile');
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuthProvider() { return useContext(AuthContext); }
