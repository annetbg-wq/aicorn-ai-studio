import { APP_CONFIG } from '@/config/app';
import type { FeedItem, PricingTier, ProgressEntry } from './types';

/**
 * SEED: replace with domain-specific entities.
 * Five items is the floor for a populated-feeling feed.
 */
export const SEED_FEED: readonly FeedItem[] = [
  {
    id: 'seed-1',
    title: 'Morning intention',
    subtitle: 'Start with three minutes of stillness',
    kind: 'practice',
    accent: 'brand',
    createdAt: '2026-04-30T07:15:00Z',
    meta: { duration: 3 },
  },
  {
    id: 'seed-2',
    title: 'Deep work block',
    subtitle: 'Focus session, no interruptions',
    kind: 'focus',
    accent: 'violet',
    createdAt: '2026-04-30T09:00:00Z',
    meta: { duration: 45 },
  },
  {
    id: 'seed-3',
    title: 'Movement break',
    subtitle: 'Stretch and reset posture',
    kind: 'movement',
    accent: 'success',
    createdAt: '2026-04-30T12:30:00Z',
    meta: { duration: 5 },
  },
  {
    id: 'seed-4',
    title: 'Evening review',
    subtitle: 'What went well today',
    kind: 'reflection',
    accent: 'warning',
    createdAt: '2026-04-30T20:00:00Z',
    meta: { duration: 5 },
  },
  {
    id: 'seed-5',
    title: 'Wind down',
    subtitle: 'Slow breathing before sleep',
    kind: 'rest',
    accent: 'rose',
    createdAt: '2026-04-30T22:30:00Z',
    meta: { duration: 8 },
  },
] as const;

export const SEED_PROGRESS: readonly ProgressEntry[] = [
  { date: '2026-04-24', value: 2, goalMet: false },
  { date: '2026-04-25', value: 4, goalMet: true },
  { date: '2026-04-26', value: 3, goalMet: true },
  { date: '2026-04-27', value: 1, goalMet: false },
  { date: '2026-04-28', value: 5, goalMet: true },
  { date: '2026-04-29', value: 4, goalMet: true },
  { date: '2026-04-30', value: 3, goalMet: true },
] as const;

export const PRICING_TIERS: readonly PricingTier[] = [
  {
    id: 'free',
    name: 'Free',
    pricePerMonth: 0,
    features: [
      'Basic features',
      `Up to ${APP_CONFIG.freeActionLimit} actions per day`,
      'Community support',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    pricePerMonth: 9,
    highlight: true,
    features: [
      'Everything in Free',
      'Unlimited actions',
      'Detailed insights',
      'Priority email support',
    ],
  },
  {
    id: 'premium',
    name: 'Premium',
    pricePerMonth: 19,
    features: [
      'Everything in Pro',
      '1-on-1 coaching session monthly',
      'Early access to new features',
    ],
  },
] as const;
