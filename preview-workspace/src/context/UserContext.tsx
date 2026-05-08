import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { UserProfile } from '@/data/types';

interface UserContextType {
  userProfile: UserProfile | null;
  setUserProfile: (profile: UserProfile) => void;
  onboardingComplete: boolean;
  setOnboardingComplete: (v: boolean) => void;
  isPremium: boolean;
  setIsPremium: (v: boolean) => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem('user_profile');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [onboardingComplete, setOnboardingComplete] = useState<boolean>(() => {
    return localStorage.getItem('onboarding_complete') === 'true';
  });

  const [isPremium, setIsPremium] = useState<boolean>(() => {
    return localStorage.getItem('is_premium') === 'true';
  });

  useEffect(() => {
    if (userProfile) {
      localStorage.setItem('user_profile', JSON.stringify(userProfile));
    }
  }, [userProfile]);

  useEffect(() => {
    localStorage.setItem('onboarding_complete', onboardingComplete ? 'true' : 'false');
  }, [onboardingComplete]);

  useEffect(() => {
    localStorage.setItem('is_premium', isPremium ? 'true' : 'false');
  }, [isPremium]);

  return (
    <UserContext.Provider
      value={{
        userProfile,
        setUserProfile,
        onboardingComplete,
        setOnboardingComplete,
        isPremium,
        setIsPremium,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within UserProvider');
  return ctx;
}