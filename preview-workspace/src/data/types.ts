import type { ThemeChoice } from '@/config/theme';

export type ID = string;
export type SubscriptionPlan = 'free' | 'pro' | 'premium';
export type LoadingState = 'idle' | 'loading' | 'ready' | 'error';

export interface UserProfile {
  id: ID;
  name: string;
  goal: string;
  createdAt: string;
  onboardingComplete: boolean;
  plan: SubscriptionPlan;
  usageCount: number;
}

/**
 * SEED: agent replaces with the real domain entity (Habit, Recipe, Task...).
 * Keep the base shape — id/title/subtitle/kind/createdAt — so generic
 * surfaces (Home cards, Detail header, search) keep working.
 */
export interface FeedItem {
  id: ID;
  title: string;
  subtitle: string;
  kind: string;
  accent?: 'brand' | 'success' | 'warning' | 'rose' | 'violet';
  createdAt: string;
  meta?: Record<string, string | number | boolean>;
}

export interface ProgressEntry {
  date: string;
  value: number;
  goalMet: boolean;
}

export interface PricingTier {
  id: SubscriptionPlan;
  name: string;
  pricePerMonth: number;
  highlight?: boolean;
  features: readonly string[];
}

/** Re-exported for convenience. */
export type { ThemeChoice };
