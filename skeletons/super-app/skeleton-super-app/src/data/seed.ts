import type { DomainActivity, DomainSummary, PricingTier } from './types';

export const DOMAIN_SUMMARIES: readonly DomainSummary[] = [
  { id: 'finance', title: 'Money', subtitle: 'Weekly spending and budget', metricLabel: 'Left this week', metricValue: '$286' },
  { id: 'wellness', title: 'Wellness', subtitle: 'Sleep, hydration, and movement', metricLabel: 'Water today', metricValue: '5 / 8' },
  { id: 'learning', title: 'Learning', subtitle: 'Short practice and streaks', metricLabel: 'Current streak', metricValue: '12 days' },
];

export const DOMAIN_ACTIVITY: readonly DomainActivity[] = [
  { id: 'expense-1', domain: 'finance', title: 'Groceries', value: 64, unit: 'USD' },
  { id: 'water-1', domain: 'wellness', title: 'Water', value: 5, unit: 'glasses' },
  { id: 'lesson-1', domain: 'learning', title: 'Spanish practice', value: 10, unit: 'minutes' },
];

export const PRICING_TIERS: readonly PricingTier[] = [
  { id: 'free', name: 'Free', pricePerMonth: 0, features: ['Core domains'] },
  { id: 'pro', name: 'Pro', pricePerMonth: 12, highlight: true, features: ['Unlimited domain actions'] },
  { id: 'team', name: 'Family', pricePerMonth: 20, features: ['Shared household goals'] },
];
