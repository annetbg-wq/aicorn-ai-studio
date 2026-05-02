import { useState, useEffect } from 'react';

interface User {
  id: string;
  email: string;
  name?: string;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem('user_profile');
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });

  const [isLoading, setIsLoading] = useState(false);

  const signIn = async () => {
    setIsLoading(true);
    await new Promise(r => setTimeout(r, 800));
    const mockUser: User = { id: crypto.randomUUID(), email: 'user@example.com', name: 'Пользователь' };
    localStorage.setItem('user_profile', JSON.stringify(mockUser));
    setUser(mockUser);
    setIsLoading(false);
  };

  const signOut = () => {
    localStorage.removeItem('user_profile');
    setUser(null);
  };

  return { user, isLoading, signIn, signOut, isAuthenticated: !!user };
}
