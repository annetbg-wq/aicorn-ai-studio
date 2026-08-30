import type { SkeletonId } from './SkeletonRegistry';

export type ProductArchetype =
  | 'mobile-consumer'
  | 'dashboard'
  | 'marketing'
  | 'social'
  | 'productivity'
  | 'commerce'
  | 'marketplace'
  | 'creator-tool'
  | 'dating'
  | 'gaming'
  | 'interactive-game'
  | 'booking'
  | 'learning';

export interface SkeletonSelectionCompatibilityContract {
  archetypes: ProductArchetype[];
  surfaces: string[];
  capabilities: string[];
  incompatibleArchetypes: ProductArchetype[];
}

const MATRIX: Record<SkeletonId, SkeletonSelectionCompatibilityContract> = {
  'mobile-app': {
    archetypes: ['mobile-consumer'],
    surfaces: ['mobile', 'bottom-tabs', 'feed', 'detail', 'profile', 'onboarding'],
    capabilities: ['navigation', 'onboarding', 'profile', 'primary-action'],
    incompatibleArchetypes: ['dashboard', 'marketing', 'creator-tool'],
  },
  'saas-dashboard': {
    archetypes: ['dashboard'],
    surfaces: ['dashboard', 'sidebar', 'metrics', 'data-table', 'settings'],
    capabilities: ['analytics', 'records', 'settings'],
    incompatibleArchetypes: ['marketing', 'dating', 'interactive-game'],
  },
  'landing-page': {
    archetypes: ['marketing'],
    surfaces: ['marketing', 'hero', 'pricing', 'faq', 'cta'],
    capabilities: ['storytelling', 'conversion'],
    incompatibleArchetypes: ['dashboard', 'social', 'dating', 'gaming', 'interactive-game'],
  },
  'social-community': {
    archetypes: ['social'],
    surfaces: ['feed', 'post-detail', 'create', 'notifications', 'profile'],
    capabilities: ['feed', 'publishing', 'engagement'],
    incompatibleArchetypes: ['marketing', 'dashboard', 'interactive-game'],
  },
  'productivity-tool': {
    archetypes: ['productivity'],
    surfaces: ['workspace', 'sidebar', 'board', 'list'],
    capabilities: ['item-management', 'workspace'],
    incompatibleArchetypes: ['marketing', 'dating', 'gaming'],
  },
  ecommerce: {
    archetypes: ['commerce'],
    surfaces: ['catalog', 'product-detail', 'cart', 'checkout'],
    capabilities: ['catalog', 'cart', 'checkout'],
    incompatibleArchetypes: ['dashboard', 'dating', 'interactive-game'],
  },
  'b2b-operations-workspace': {
    archetypes: ['dashboard'],
    surfaces: ['operations', 'sidebar', 'records', 'workflow', 'reports'],
    capabilities: ['records', 'workflow', 'analytics'],
    incompatibleArchetypes: ['marketing', 'dating', 'gaming'],
  },
  'marketplace-platform': {
    archetypes: ['marketplace', 'commerce'],
    surfaces: ['browse', 'listing-detail', 'messages', 'seller-dashboard'],
    capabilities: ['listings', 'messaging', 'seller-tools'],
    incompatibleArchetypes: ['marketing', 'dashboard', 'interactive-game'],
  },
  'creator-editor-workspace': {
    archetypes: ['creator-tool'],
    surfaces: ['editor', 'canvas', 'media', 'publications'],
    capabilities: ['editing', 'assets', 'publishing'],
    incompatibleArchetypes: ['marketing', 'dating', 'commerce'],
  },
  'dating-matching-app': {
    archetypes: ['dating', 'social'],
    surfaces: ['discovery', 'matches', 'conversation', 'profile'],
    capabilities: ['matching', 'messaging', 'profile'],
    incompatibleArchetypes: ['dashboard', 'marketing', 'creator-tool'],
  },
  'gaming-casino-app': {
    archetypes: ['gaming'],
    surfaces: ['lobby', 'games', 'game-detail', 'promotions', 'account'],
    capabilities: ['game-browser', 'promotions', 'account'],
    incompatibleArchetypes: ['dashboard', 'marketing', 'creator-tool'],
  },
  'game-interactive-app': {
    archetypes: ['interactive-game'],
    surfaces: ['home', 'level-select', 'gameplay', 'leaderboard'],
    capabilities: ['playable-surface', 'progression', 'score'],
    incompatibleArchetypes: ['dashboard', 'marketing', 'commerce'],
  },
  'booking-service-app': {
    archetypes: ['booking'],
    surfaces: ['search', 'service-detail', 'booking-flow', 'bookings'],
    capabilities: ['availability', 'booking', 'management'],
    incompatibleArchetypes: ['dashboard', 'marketing', 'gaming'],
  },
  'content-learning-app': {
    archetypes: ['learning'],
    surfaces: ['catalog', 'course-detail', 'lesson-player', 'progress'],
    capabilities: ['learning-content', 'progress', 'quiz'],
    incompatibleArchetypes: ['dashboard', 'marketing', 'gaming'],
  },
};

export function getSkeletonSelectionCompatibility(id: SkeletonId): SkeletonSelectionCompatibilityContract {
  return MATRIX[id];
}

export function listSkeletonSelectionCompatibilityIds(): SkeletonId[] {
  return Object.keys(MATRIX) as SkeletonId[];
}

export function scoreSkeletonCompatibility(
  id: SkeletonId,
  archetype: ProductArchetype,
): number {
  const contract = MATRIX[id];
  if (contract.incompatibleArchetypes.includes(archetype)) return -100;
  if (contract.archetypes.includes(archetype)) return 100;
  return 0;
}
