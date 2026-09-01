import type { ThemeChoice } from '@/config/theme';

export type ID = string;
export type SubscriptionPlan = 'free' | 'pro' | 'team';
export type LoadingState = 'idle' | 'loading' | 'ready' | 'error';
export type DomainId = 'finance' | 'wellness' | 'learning';

export interface UserProfile {
  id: ID;
  name: string;
  goal: string;
  createdAt: string;
  onboardingComplete: boolean;
  plan: SubscriptionPlan;
  usageCount: number;
}

export interface DomainSummary {
  id: DomainId;
  title: string;
  subtitle: string;
  metricLabel: string;
  metricValue: string;
}

export interface DomainActivity {
  id: ID;
  domain: DomainId;
  title: string;
  value: number;
  unit: string;
}

export interface PricingTier {
  id: SubscriptionPlan;
  name: string;
  pricePerMonth: number;
  highlight?: boolean;
  features: readonly string[];
}

export type { ThemeChoice };
