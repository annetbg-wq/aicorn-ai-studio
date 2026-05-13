import { useState, useCallback, useEffect } from 'react';
import { UserProfile } from '@/data/types';

const STORAGE_KEY = 'userProfile';

const DEFAULT_PROFILE: UserProfile = {
  name: '',
  avatar: '',
  joinDate: new Date().toISOString(),
  totalHabits: 0,
  longestStreak: 0,
};

export function useProfile() {
  const [profile, setProfile] = useState<UserProfile>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {}
    return DEFAULT_PROFILE;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  }, [profile]);

  const updateProfile = useCallback((updates: Partial<UserProfile>) => {
    setProfile(prev => ({ ...prev, ...updates }));
  }, []);

  const updateAvatar = useCallback((avatar: string) => {
    setProfile(prev => ({ ...prev, avatar }));
  }, []);

  const resetProfile = useCallback(() => {
    setProfile(DEFAULT_PROFILE);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return {
    profile,
    updateProfile,
    updateAvatar,
    resetProfile,
  };
}
