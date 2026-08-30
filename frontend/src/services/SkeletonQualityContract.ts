import type { SkeletonId } from './SkeletonRegistry';

export interface SkeletonQualityContract {
  minMeaningfulScreens: number;
  requiredCapabilities: string[];
  requiredFlows: string[];
}

const DEFAULT_QUALITY_CONTRACT: SkeletonQualityContract = {
  minMeaningfulScreens: 1,
  requiredCapabilities: [],
  requiredFlows: [],
};

const QUALITY_CONTRACTS: Record<SkeletonId, SkeletonQualityContract> = {
  'mobile-app': {
    minMeaningfulScreens: 4,
    requiredCapabilities: ['navigation', 'onboarding', 'primary-action', 'profile'],
    requiredFlows: ['onboarding-to-home', 'home-to-detail'],
  },
  'saas-dashboard': {
    minMeaningfulScreens: 3,
    requiredCapabilities: ['sidebar-navigation', 'dashboard', 'data-view', 'settings'],
    requiredFlows: ['dashboard-to-data', 'settings-access'],
  },
  'landing-page': {
    minMeaningfulScreens: 1,
    requiredCapabilities: ['hero', 'value-proposition', 'call-to-action'],
    requiredFlows: ['hero-to-cta'],
  },
  'social-community': {
    minMeaningfulScreens: 4,
    requiredCapabilities: ['feed', 'create', 'profile', 'notifications'],
    requiredFlows: ['feed-to-detail', 'create-post'],
  },
  'productivity-tool': {
    minMeaningfulScreens: 1,
    requiredCapabilities: ['workspace', 'item-management'],
    requiredFlows: ['workspace-primary-action'],
  },
  ecommerce: {
    minMeaningfulScreens: 5,
    requiredCapabilities: ['catalog', 'product-detail', 'cart', 'checkout'],
    requiredFlows: ['browse-to-product', 'product-to-cart', 'cart-to-checkout'],
  },
  'b2b-operations-workspace': {
    minMeaningfulScreens: 4,
    requiredCapabilities: ['dashboard', 'records', 'record-detail', 'workflow'],
    requiredFlows: ['dashboard-to-records', 'records-to-detail'],
  },
  'marketplace-platform': {
    minMeaningfulScreens: 4,
    requiredCapabilities: ['browse', 'listing-detail', 'messages', 'seller-surface'],
    requiredFlows: ['browse-to-listing', 'listing-to-message'],
  },
  'creator-editor-workspace': {
    minMeaningfulScreens: 4,
    requiredCapabilities: ['project-home', 'editor', 'media', 'publishing'],
    requiredFlows: ['home-to-editor', 'editor-to-publication'],
  },
  'dating-matching-app': {
    minMeaningfulScreens: 4,
    requiredCapabilities: ['discovery', 'matches', 'conversation', 'profile'],
    requiredFlows: ['discover-to-match', 'match-to-conversation'],
  },
  'gaming-casino-app': {
    minMeaningfulScreens: 4,
    requiredCapabilities: ['lobby', 'game-browser', 'game-detail', 'account'],
    requiredFlows: ['lobby-to-game', 'game-to-detail'],
  },
  'game-interactive-app': {
    minMeaningfulScreens: 4,
    requiredCapabilities: ['home', 'level-select', 'playable-surface', 'leaderboard'],
    requiredFlows: ['home-to-level', 'level-to-gameplay'],
  },
  'booking-service-app': {
    minMeaningfulScreens: 4,
    requiredCapabilities: ['search', 'service-detail', 'booking-flow', 'bookings'],
    requiredFlows: ['search-to-service', 'service-to-booking'],
  },
  'content-learning-app': {
    minMeaningfulScreens: 4,
    requiredCapabilities: ['catalog', 'course-detail', 'lesson-player', 'progress'],
    requiredFlows: ['catalog-to-course', 'course-to-lesson'],
  },
};

export function getSkeletonQualityContract(id: SkeletonId): SkeletonQualityContract {
  return QUALITY_CONTRACTS[id] ?? DEFAULT_QUALITY_CONTRACT;
}

export function listSkeletonQualityContractIds(): SkeletonId[] {
  return Object.keys(QUALITY_CONTRACTS) as SkeletonId[];
}
