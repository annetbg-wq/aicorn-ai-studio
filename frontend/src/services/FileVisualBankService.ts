/// <reference types="vite/client" />

import {
  getSkeletonVisualCompatibility,
  SKELETON_REGISTRY,
  type SkeletonId,
  type SkeletonVisualCompatibilityContract,
} from './SkeletonRegistry';

export type VisualBankScalar = string | number | boolean | null;
export type VisualBankJson = VisualBankScalar | VisualBankJson[] | { [key: string]: VisualBankJson };

export type TrustLevel = 'low' | 'medium' | 'high' | 'regulated';
export type EnergyLevel = 'calm' | 'balanced' | 'energetic';
export type DensityProfile = 'compact' | 'comfortable' | 'spacious';
export type RadiusProfile = 'sharp' | 'soft' | 'pill';
export type MotionProfile = 'reduced' | 'gentle' | 'expressive';
export type ContrastProfile = 'low' | 'medium' | 'high';

export interface ProductToneParameters {
  trust_level: TrustLevel;
  energy_level: EnergyLevel;
  density: DensityProfile;
  radius_profile: RadiusProfile;
  motion_profile: MotionProfile;
  contrast_profile: ContrastProfile;
}

export interface ColorFamilyTokenMap {
  background: string;
  foreground: string;
  muted: string;
  card: string;
  primary: string;
  secondary: string;
  accent: string;
  border: string;
  success: string;
  warning: string;
  danger: string;
  chartPalette: string[];
}

export interface ColorFamilyManifestSchema {
  id: string;
  name?: string;
  description?: string;
  domains?: string[];
  subdomains?: string[];
  toneProfiles?: string[];
  trustProfiles?: string[];
  densityProfiles?: string[];
  contrastProfiles?: string[];
  tokens?: Partial<ColorFamilyTokenMap>;
  chartPalette?: string[];
  ramp?: Record<string, unknown>;
  usage?: Record<string, unknown>;
}

export interface NormalizedColorFamily {
  id: string;
  name: string;
  sourcePath: string;
  domains: string[];
  subdomains: string[];
  toneProfiles: string[];
  trustProfiles: string[];
  densityProfiles: string[];
  contrastProfiles: string[];
  tokens: ColorFamilyTokenMap;
  raw: ColorFamilyManifestSchema;
}

export interface VariationPreset {
  id: string;
  visualPackVariant: string;
  colorFamilyVariant: string;
  spacingPreset: DensityProfile;
  radiusPreset: RadiusProfile;
  elevationPreset: 'flat' | 'subtle' | 'layered' | 'expressive';
  motionPreset: MotionProfile;
  blockEmphasisPreset: 'content-first' | 'action-first' | 'data-first' | 'community-first' | 'commerce-first';
}

export interface VisualPackManifestSchema {
  id: string;
  skeleton: SkeletonId | string;
  purpose?: string;
  whenToUse?: string[];
  requiredComponents?: string[];
  allowedSurfaces?: string[];
  linkedStyleFiles?: string[];
  linkedComponentFiles?: string[];
  layoutPresetFiles?: string[];
  motionPresetFiles?: string[];
  assetReferenceFiles?: string[];
  compatibleSkeletons?: string[];
  skeletonPath?: string;
  domains?: string[];
  subdomains?: string[];
  surfaces?: string[];
  trustProfiles?: string[];
  toneProfiles?: string[];
  densityProfiles?: string[];
  radiusProfiles?: string[];
  motionProfiles?: string[];
  contrastProfiles?: string[];
  layoutPatterns?: string[];
  componentFamilies?: string[];
  colorFamilies?: string[];
  requiredBlocks?: string[];
  requiredFiles?: string[];
  forbiddenPatterns?: string[];
  antiRepeatGroup?: string;
  priorityScore?: number;
  variants?: string[];
  description?: string;
  variantCount?: number;
}

export interface VisualVariantSchema {
  id: string;
  packId?: string;
  skeleton?: SkeletonId | string;
  name?: string;
  theme?: string;
  spacing?: string;
  typography?: string;
  radius?: VisualBankJson;
  motionPreset?: string;
  densityProfile?: string;
  radiusProfile?: string;
  contrastProfile?: string;
  trustProfile?: string;
  toneProfile?: string;
  domains?: string[];
  subdomains?: string[];
  surfaces?: string[];
  colorFamily?: string;
  targetUsers?: string;
  tokenHints?: string[];
  componentHints?: string[];
  layoutHints?: string[];
  forbiddenPatterns?: string[];
  requiredFiles?: string[];
  sourceFiles?: string[];
  sourcePath?: string;
  colorAccent?: string;
  layout?: string;
  componentSet?: Record<string, string>;
  referenceSource?: string;
  [key: string]: unknown;
}

export interface SemanticDomainManifestSchema {
  id: string;
  type?: 'domain' | string;
  name?: string;
  entities?: string[];
  roles?: string[];
  typicalFlows?: string[];
  restrictions?: string[];
  uiPatterns?: string[];
  recommendedDesign?: string;
  recommendedArchetypes?: string[];
  subdomains?: string[];
  colorFamilies?: string[];
}

export interface NormalizedVisualVariant {
  variantId: string;
  packId: string;
  skeleton: SkeletonId;
  variantPath: string;
  selectedVariantPath: string;
  sourcePath?: string;
  name: string;
  theme: string;
  spacing: string;
  typography: string;
  radius: VisualBankJson;
  motionPreset: string;
  densityProfile: string;
  radiusProfile: string;
  contrastProfile: string;
  trustProfile: string;
  toneProfile: string;
  domains: string[];
  subdomains: string[];
  surfaces: string[];
  colorFamily: string;
  colorFamilies: string[];
  targetUsers: string;
  tokenHints: string[];
  componentHints: string[];
  layoutHints: string[];
  forbiddenPatterns: string[];
  requiredFiles: string[];
  sourceFiles: string[];
  variationSeed: string;
  antiRepeatGroup: string;
  raw: VisualVariantSchema;
}

export interface NormalizedVisualPack {
  packId: string;
  manifestPath: string;
  selectedManifestPath: string;
  skeleton: SkeletonId;
  purpose: string;
  whenToUse: string[];
  requiredComponents: string[];
  allowedSurfaces: string[];
  linkedStyleFiles: string[];
  linkedComponentFiles: string[];
  layoutPresetFiles: string[];
  motionPresetFiles: string[];
  assetReferenceFiles: string[];
  materialFiles: string[];
  compatibleSkeletons: SkeletonId[];
  skeletonPath: string;
  domains: string[];
  subdomains: string[];
  surfaces: string[];
  trustProfiles: string[];
  toneProfiles: string[];
  densityProfiles: string[];
  radiusProfiles: string[];
  motionProfiles: string[];
  contrastProfiles: string[];
  layoutPatterns: string[];
  componentFamilies: string[];
  colorFamilies: string[];
  requiredBlocks: string[];
  requiredFiles: string[];
  forbiddenPatterns: string[];
  antiRepeatGroup: string;
  priorityScore: number;
  variants: NormalizedVisualVariant[];
  sourceFiles: string[];
  raw: VisualPackManifestSchema;
}

export interface NormalizedVisualBank {
  packs: NormalizedVisualPack[];
  semanticDomains: SemanticDomainManifestSchema[];
  colorFamilies: NormalizedColorFamily[];
  sourceFiles: string[];
}

export interface VisualSelectionSignals {
  semanticDomainId: string | null;
  productDomain: string;
  domainTags: string[];
  selectedSurface: string;
  selectedSubdomain: string;
  productTone: ProductToneParameters;
  subdomains: string[];
  surfaces: string[];
  toneProfiles: string[];
  colorFamilyCandidates: string[];
  preferredVariants: string[];
  recommendedVisualPacks: SkeletonId[];
  recommendedDesign: string | null;
  allowToneRepeat: boolean;
}

export interface VisualSelection {
  selectedPackId: string;
  selectedVariantId: string;
  selectedVariantPath?: string;
  selectedManifestPath?: string;
  selectedThemeFile?: string;
  purpose: string;
  whenToUse: string[];
  requiredComponents: string[];
  allowedSurfaces: string[];
  linkedStyleFiles: string[];
  linkedComponentFiles: string[];
  layoutPresetFiles: string[];
  motionPresetFiles: string[];
  assetReferenceFiles: string[];
  materialFiles: string[];
  compatibleSkeletons: SkeletonId[];
  domains: string[];
  subdomains: string[];
  surfaces: string[];
  trustProfile: string;
  toneProfile: string;
  productTone: ProductToneParameters;
  theme: string;
  colorFamily: string;
  colorFamilyTokens: ColorFamilyTokenMap;
  colorFamilies: string[];
  spacing: string;
  typography: string;
  radius: VisualBankJson;
  radiusProfile: string;
  motionPreset: string;
  densityProfile: string;
  contrastProfile: string;
  variationPreset: VariationPreset;
  targetUsers: string;
  tokenHints: string[];
  componentHints: string[];
  layoutHints: string[];
  forbiddenPatterns: string[];
  requiredFiles: string[];
  sourceFiles: string[];
  variationSeed: string;
  antiRepeatGroup: string;
  fallbackVisualSelection: boolean;
  pack: NormalizedVisualPack | null;
  variant: NormalizedVisualVariant | null;
  score: number;
  audit: VisualSelectionAudit;
  signals: VisualSelectionSignals;
}

export interface ResolveVisualSelectionInput {
  brief: string;
  skeletonId: SkeletonId;
  projectId?: string;
  semanticDomainId?: string | null;
  semanticDomain?: SemanticDomainManifestSchema | null;
  surface?: string | null;
  subdomain?: string | null;
  tone?: string | null;
  productTone?: Partial<ProductToneParameters>;
  recentSelections?: RecentVisualSelection[];
  visualBankOverride?: NormalizedVisualBank;
  visualPacksOverride?: NormalizedVisualPack[];
}

interface VisualCandidate {
  pack: NormalizedVisualPack;
  variant: NormalizedVisualVariant;
  skeletonFit: number;
  domainFit: number;
  toneFit: number;
  surfaceFit: number;
  relevanceScore: number;
  diversityScore: number;
  score: number;
  relevanceReasons: string[];
  diversityReasons: string[];
  antiRepeatPenalty: number;
  antiRepeatBonus: number;
  semanticNeighbor: boolean;
  exactMatch: boolean;
}

export interface RecentVisualSelection {
  skeletonId?: SkeletonId;
  domain?: string | null;
  semanticDomainId?: string | null;
  selectedPackId?: string;
  selectedVariantId?: string;
  antiRepeatGroup?: string;
  colorFamily?: string;
  variationPresetId?: string;
  productToneSignature?: string;
}

export interface VisualCandidateAudit {
  packId: string;
  variantId: string;
  skeletonFit: number;
  domainFit: number;
  toneFit: number;
  surfaceFit: number;
  relevanceScore: number;
  diversityScore: number;
  finalScore: number;
  antiRepeatPenalty: number;
  antiRepeatBonus: number;
  semanticNeighbor: boolean;
  exactMatch: boolean;
  reasons: string[];
}

export interface VisualSelectionAudit {
  pipelineStages: Array<{ stage: string; before: number; after: number; retainedIds: string[]; fallbackToPrevious?: boolean }>;
  bestScore: number;
  bestRelevanceScore: number;
  relevanceWindow: number;
  adaptiveWindow: number;
  minimumRelevanceFloor: number;
  desiredPoolSize: number;
  maxPoolSize: number;
  viableByRelevanceCount: number;
  viableByRelevance: VisualCandidateAudit[];
  viableCandidatesCount: number;
  viableCandidates: VisualCandidateAudit[];
  candidates: VisualCandidateAudit[];
  selectedBySeed: boolean;
  selectedByStableIndex: boolean;
  selectedAfterDiversity: boolean;
  selectedByExactMatch: boolean;
  selectedVariantId: string;
  fallbackVisualSelection: boolean;
}

const manifestModules = import.meta.glob(
  '../../../prototype-bank/design-packs/domain/*/manifest.json',
  { eager: true, import: 'default' },
) as Record<string, VisualPackManifestSchema>;

const variantModules = import.meta.glob(
  '../../../prototype-bank/design-packs/domain/*/visual-variants/*.json',
  { eager: true, import: 'default' },
) as Record<string, VisualVariantSchema>;

const semanticDomainModules = import.meta.glob(
  '../../../prototype-bank/domains/*/manifest.json',
  { eager: true, import: 'default' },
) as Record<string, SemanticDomainManifestSchema>;

const colorFamilyModules = import.meta.glob(
  '../../../prototype-bank/design-packs/assets/color-ramps/*.json',
  { eager: true, import: 'default' },
) as Record<string, ColorFamilyManifestSchema>;

const COLOR_RAMP_PATHS = new Set(Object.keys(colorFamilyModules).map(normalizeSourcePath));

const SPACING_PATHS = new Set([
  'compact',
  'comfortable',
  'spacious',
].map(spacing => `prototype-bank/design-packs/assets/spacing/${spacing}.json`));

const PRODUCT_DOMAIN_KEYWORDS: Array<{ id: string; rx: RegExp }> = [
  { id: 'ecommerce', rx: /\b(shop|store|cart|checkout|catalog|product|retail|marketplace|ecommerce|e-commerce|buy|sell|товар|магазин|корзин|покуп)/i },
  { id: 'landing-page', rx: /\b(landing|website|waitlist|launch|pricing|hero|marketing|homepage|site|promo|лендинг|сайт|запуск)/i },
  { id: 'social-community', rx: /\b(social|community|feed|post|follow|forum|network|creator|comment|like|соц|сообще|лента|пост)/i },
  { id: 'productivity-tool', rx: /\b(task|todo|kanban|note|workspace|project tracker|productivity|planner|calendar|command palette|задач|замет|план|канбан)/i },
  { id: 'saas-dashboard', rx: /\b(dashboard|admin|analytics|metrics|crm|b2b|operations|reporting|table|дашборд|аналит|метрик|админ)/i },
  { id: 'mobile-app', rx: /\b(mobile|app|habit|tracker|journal|fitness|wellness|health app|прилож|трекер|дневник|привыч)/i },
];

const SEMANTIC_KEYWORDS: Array<{ id: string; rx: RegExp }> = [
  { id: 'medicine', rx: /\b(med|health|clinic|patient|doctor|appointment|prescription|hospital|therapy|care|wellbeing|здоров|медиц|пациент|врач|клиник|больниц)/i },
  { id: 'wellness', rx: /\b(wellness|meditat|mindful|yoga|fitness|habit|mood|self care|sleep|calm|wellbeing|йога|медитац|привыч|настроени|сон)/i },
  { id: 'fintech', rx: /\b(bank|finance|wallet|crypto|payment|invoice|budget|transaction|trading|fintech|банк|финанс|кошел|платеж|бюдж|транзак)/i },
  { id: 'gaming', rx: /\b(game|play|leaderboard|xp|achievement|quest|игр|лидер|достиж)/i },
  { id: 'social', rx: /\b(social|feed|post|follow|like|comment|story|community|creator|соцсет|лента|подпис|пост|коммент|сообще)/i },
  { id: 'ai-tools', rx: /\b(ai|gpt|llm|prompt|generate|assistant|copilot|agent|нейро|ассистент|генерац)/i },
];

const SURFACE_BY_SKELETON: Record<SkeletonId, string[]> = {
  'mobile-app':               ['mobile', 'bottom-tabs', 'feed', 'detail', 'profile', 'onboarding'],
  'saas-dashboard':           ['dashboard', 'sidebar', 'metrics', 'data-table', 'settings', 'workspace'],
  'landing-page':             ['marketing', 'hero', 'pricing', 'faq', 'cta', 'top-nav', 'social-proof'],
  'social-community':         ['mobile', 'bottom-tabs', 'feed', 'explore', 'notifications', 'profile', 'post-detail'],
  'productivity-tool':        ['workspace', 'sidebar', 'kanban', 'list', 'detail-sheet', 'command-palette'],
  'ecommerce':                ['storefront', 'product-grid', 'product-detail', 'cart', 'checkout', 'account'],
  'b2b-operations-workspace': ['sidebar', 'dashboard', 'records-list', 'record-detail', 'settings', 'workspace'],
  'marketplace-platform':     ['storefront', 'listing-grid', 'product-detail', 'cart', 'checkout', 'seller-dashboard'],
  'creator-editor-workspace': ['sidebar', 'canvas', 'properties-panel', 'asset-library', 'project-list'],
  'dating-matching-app':      ['mobile', 'bottom-tabs', 'swipe-deck', 'matches', 'conversation', 'profile'],
  'gaming-casino-app':        ['mobile', 'bottom-tabs', 'game-lobby', 'game-detail', 'promotions', 'account'],
  'game-interactive-app':     ['mobile', 'bottom-tabs', 'level-select', 'game-play', 'leaderboard', 'profile'],
  'booking-service-app':      ['mobile', 'bottom-tabs', 'service-list', 'booking-flow', 'my-bookings', 'profile'],
  'content-learning-app':     ['mobile', 'bottom-tabs', 'course-catalog', 'course-detail', 'lesson-player', 'profile'],
};

const SURFACE_SOURCE_FILES: Record<SkeletonId, string[]> = {
  'mobile-app': [
    'prototype-bank/design-packs/surfaces/blocks/mobile-nav.tsx',
    'prototype-bank/design-packs/surfaces/blocks/feed-item.tsx',
    'prototype-bank/design-packs/surfaces/blocks/onboarding-step.tsx',
    'prototype-bank/design-packs/surfaces/cards/profile-card.tsx',
  ],
  'saas-dashboard': [
    'prototype-bank/design-packs/surfaces/blocks/sidebar-nav.tsx',
    'prototype-bank/design-packs/surfaces/blocks/dashboard-header.tsx',
    'prototype-bank/design-packs/surfaces/cards/stat-card.tsx',
    'prototype-bank/design-packs/surfaces/cards/metric-card.tsx',
    'prototype-bank/design-packs/surfaces/cards/list-item.tsx',
  ],
  'landing-page': [
    'prototype-bank/design-packs/surfaces/primitives/button.tsx',
    'prototype-bank/design-packs/surfaces/primitives/card.tsx',
    'prototype-bank/design-packs/surfaces/cards/stat-card.tsx',
  ],
  'social-community': [
    'prototype-bank/design-packs/surfaces/blocks/mobile-nav.tsx',
    'prototype-bank/design-packs/surfaces/blocks/feed-item.tsx',
    'prototype-bank/design-packs/surfaces/cards/profile-card.tsx',
    'prototype-bank/design-packs/surfaces/primitives/avatar.tsx',
  ],
  'productivity-tool': [
    'prototype-bank/design-packs/surfaces/blocks/sidebar-nav.tsx',
    'prototype-bank/design-packs/surfaces/blocks/dashboard-header.tsx',
    'prototype-bank/design-packs/surfaces/cards/list-item.tsx',
    'prototype-bank/design-packs/surfaces/cards/metric-card.tsx',
    'prototype-bank/design-packs/surfaces/primitives/tabs.tsx',
  ],
  'ecommerce': [
    'prototype-bank/design-packs/surfaces/primitives/button.tsx',
    'prototype-bank/design-packs/surfaces/primitives/card.tsx',
    'prototype-bank/design-packs/surfaces/cards/list-item.tsx',
    'prototype-bank/design-packs/surfaces/cards/profile-card.tsx',
  ],
  'b2b-operations-workspace': [
    'prototype-bank/design-packs/surfaces/blocks/sidebar-nav.tsx',
    'prototype-bank/design-packs/surfaces/blocks/dashboard-header.tsx',
    'prototype-bank/design-packs/surfaces/cards/list-item.tsx',
    'prototype-bank/design-packs/surfaces/cards/metric-card.tsx',
  ],
  'marketplace-platform': [
    'prototype-bank/design-packs/surfaces/primitives/button.tsx',
    'prototype-bank/design-packs/surfaces/primitives/card.tsx',
    'prototype-bank/design-packs/surfaces/cards/list-item.tsx',
  ],
  'creator-editor-workspace': [
    'prototype-bank/design-packs/surfaces/blocks/sidebar-nav.tsx',
    'prototype-bank/design-packs/surfaces/blocks/dashboard-header.tsx',
    'prototype-bank/design-packs/surfaces/primitives/tabs.tsx',
  ],
  'dating-matching-app': [
    'prototype-bank/design-packs/surfaces/blocks/mobile-nav.tsx',
    'prototype-bank/design-packs/surfaces/cards/profile-card.tsx',
    'prototype-bank/design-packs/surfaces/primitives/avatar.tsx',
  ],
  'gaming-casino-app': [
    'prototype-bank/design-packs/surfaces/blocks/mobile-nav.tsx',
    'prototype-bank/design-packs/surfaces/cards/list-item.tsx',
    'prototype-bank/design-packs/surfaces/primitives/card.tsx',
  ],
  'game-interactive-app': [
    'prototype-bank/design-packs/surfaces/blocks/mobile-nav.tsx',
    'prototype-bank/design-packs/surfaces/cards/list-item.tsx',
    'prototype-bank/design-packs/surfaces/primitives/card.tsx',
  ],
  'booking-service-app': [
    'prototype-bank/design-packs/surfaces/blocks/mobile-nav.tsx',
    'prototype-bank/design-packs/surfaces/cards/list-item.tsx',
    'prototype-bank/design-packs/surfaces/primitives/card.tsx',
  ],
  'content-learning-app': [
    'prototype-bank/design-packs/surfaces/blocks/mobile-nav.tsx',
    'prototype-bank/design-packs/surfaces/cards/list-item.tsx',
    'prototype-bank/design-packs/surfaces/primitives/card.tsx',
    'prototype-bank/design-packs/surfaces/primitives/tabs.tsx',
  ],
};

const PACK_DOMAIN_ALIASES: Record<SkeletonId, string[]> = {
  'mobile-app':               ['consumer', 'wellness', 'health', 'habit', 'lifestyle'],
  'saas-dashboard':           ['saas', 'b2b', 'admin', 'analytics', 'fintech', 'medicine', 'ai-tools'],
  'landing-page':             ['marketing', 'saas', 'ecommerce', 'creator', 'fintech', 'wellness'],
  'social-community':         ['social', 'community', 'creator', 'forum', 'network', 'medicine'],
  'productivity-tool':        ['productivity', 'workspace', 'tasks', 'notes', 'ai-tools', 'saas', 'wellness'],
  'ecommerce':                ['commerce', 'storefront', 'retail', 'creator', 'marketplace'],
  'b2b-operations-workspace': ['b2b', 'operations', 'workspace', 'saas', 'admin', 'analytics'],
  'marketplace-platform':     ['commerce', 'marketplace', 'storefront', 'retail', 'multi-vendor'],
  'creator-editor-workspace': ['creator', 'design', 'editor', 'workspace', 'productivity'],
  'dating-matching-app':      ['dating', 'social', 'consumer', 'lifestyle', 'community'],
  'gaming-casino-app':        ['gaming', 'casino', 'entertainment', 'consumer'],
  'game-interactive-app':     ['gaming', 'interactive', 'entertainment', 'consumer'],
  'booking-service-app':      ['booking', 'services', 'appointments', 'consumer', 'wellness', 'health'],
  'content-learning-app':     ['education', 'learning', 'courses', 'consumer', 'wellness'],
};

const SEMANTIC_NEIGHBOR_VARIANTS: Record<string, string[]> = {
  'fintech-corporate': ['premium-dark', 'minimal-brutal', 'calm'],
  clinical: ['calm', 'premium-dark', 'mobile-soft'],
  'creator-social': ['playful', 'mobile-soft', 'calm'],
  playful: ['creator-social', 'mobile-soft', 'calm'],
  'premium-dark': ['fintech-corporate', 'minimal-brutal', 'clinical', 'calm'],
  'mobile-soft': ['calm', 'playful', 'creator-social'],
  'minimal-brutal': ['premium-dark', 'fintech-corporate', 'calm'],
  calm: ['mobile-soft', 'clinical', 'premium-dark'],
};

const DOMAIN_SUBDOMAIN_REGISTRY: Record<string, string[]> = {
  health: ['clinical', 'wellness', 'habit-fitness', 'women-health', 'supplements-nutrition', 'nutrition', 'mental-health'],
  medicine: ['clinical', 'healthcare', 'patient-care', 'care-team', 'women-health', 'mental-health'],
  wellness: ['wellness', 'habit-fitness', 'self-care', 'daily-focus', 'mental-health'],
  fintech: ['banking', 'payments', 'wallet', 'budgeting', 'finance-ops', 'compliance'],
  social: ['creator-network', 'feed', 'community', 'profile', 'messaging'],
  ecommerce: ['catalog', 'checkout', 'marketplace', 'luxury-retail', 'creator-commerce'],
  productivity: ['task-management', 'kanban', 'notes', 'team-workspace', 'personal-ops'],
  'ai-tools': ['ai-workspace', 'prompting', 'automation', 'assistant', 'knowledge-base'],
  gaming: ['game-loop', 'leaderboard', 'achievement', 'community', 'streaming'],
  education: ['learning', 'coursework', 'coaching', 'student-progress'],
};

const DOMAIN_COLOR_FAMILY_REGISTRY: Record<string, string[]> = {
  health: ['clinical-teal', 'wellness-sage', 'soft-womens-health', 'nutrition-amber-green', 'calm-lavender', 'medical-navy-teal'],
  medicine: ['clinical-teal', 'medical-navy-teal', 'calm-lavender', 'wellness-sage'],
  wellness: ['wellness-sage', 'calm-lavender', 'soft-womens-health', 'neutral'],
  fintech: ['fintech-indigo', 'medical-navy-teal', 'neutral', 'luxury-dark-gold'],
  social: ['cool-blue', 'playful-coral', 'soft-womens-health', 'luxury-dark-gold'],
  ecommerce: ['playful-coral', 'luxury-dark-gold', 'neutral', 'cool-blue'],
  productivity: ['neutral', 'cool-blue', 'fintech-indigo', 'clinical-teal'],
  'ai-tools': ['cool-blue', 'fintech-indigo', 'neutral', 'gaming-neon'],
  gaming: ['gaming-neon', 'luxury-dark-gold', 'playful-coral', 'cool-blue'],
};

const VARIATION_PRESET_OPTIONS: Array<Omit<VariationPreset, 'visualPackVariant' | 'colorFamilyVariant'>> = [
  {
    id: 'quiet-clinical',
    spacingPreset: 'comfortable',
    radiusPreset: 'sharp',
    elevationPreset: 'flat',
    motionPreset: 'reduced',
    blockEmphasisPreset: 'data-first',
  },
  {
    id: 'soft-consumer',
    spacingPreset: 'spacious',
    radiusPreset: 'pill',
    elevationPreset: 'subtle',
    motionPreset: 'gentle',
    blockEmphasisPreset: 'content-first',
  },
  {
    id: 'operator-compact',
    spacingPreset: 'compact',
    radiusPreset: 'sharp',
    elevationPreset: 'subtle',
    motionPreset: 'reduced',
    blockEmphasisPreset: 'data-first',
  },
  {
    id: 'warm-action',
    spacingPreset: 'comfortable',
    radiusPreset: 'soft',
    elevationPreset: 'layered',
    motionPreset: 'gentle',
    blockEmphasisPreset: 'action-first',
  },
  {
    id: 'expressive-community',
    spacingPreset: 'spacious',
    radiusPreset: 'pill',
    elevationPreset: 'expressive',
    motionPreset: 'expressive',
    blockEmphasisPreset: 'community-first',
  },
];

const DESIRED_STRONG_POOL_SIZE = 2;
const MAX_STRONG_POOL_SIZE = 4;

let cachedBank: NormalizedVisualBank | null = null;
const recentVisualSelectionMemory: RecentVisualSelection[] = [];

export function loadFileVisualBank(): NormalizedVisualBank {
  if (cachedBank) return cachedBank;

  const semanticDomains = Object.entries(semanticDomainModules)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, domain]) => domain);
  const colorFamilies = Object.entries(colorFamilyModules)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([modulePath, raw]) => normalizeColorFamily(raw, normalizeSourcePath(modulePath)));

  const variantsByPack = new Map<string, Array<{ path: string; raw: VisualVariantSchema }>>();
  for (const [modulePath, raw] of Object.entries(variantModules)) {
    const sourcePath = normalizeSourcePath(modulePath);
    const packId = packIdFromPath(sourcePath) ?? str(raw.packId) ?? str(raw.skeleton) ?? '';
    if (!packId) continue;
    const list = variantsByPack.get(packId) ?? [];
    list.push({ path: sourcePath, raw });
    variantsByPack.set(packId, list);
  }

  const packs = Object.entries(manifestModules)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([modulePath, raw]) => normalizePack(raw, normalizeSourcePath(modulePath), variantsByPack))
    .filter((pack): pack is NormalizedVisualPack => Boolean(pack));

  cachedBank = {
    packs,
    semanticDomains,
    colorFamilies,
    sourceFiles: unique([
      ...packs.flatMap(pack => pack.sourceFiles),
      ...colorFamilies.map(family => family.sourcePath),
      ...Object.keys(semanticDomainModules).map(normalizeSourcePath),
    ]),
  };
  return cachedBank;
}

export function invalidateFileVisualBankCache(): void {
  cachedBank = null;
}

export function clearFileVisualSelectionMemory(): void {
  recentVisualSelectionMemory.length = 0;
}

export function getRecentFileVisualSelections(): RecentVisualSelection[] {
  return [...recentVisualSelectionMemory];
}

export function resolveFileVisualSelection(input: ResolveVisualSelectionInput): VisualSelection {
  const bank = input.visualBankOverride ?? loadFileVisualBank();
  const packs = input.visualPacksOverride ?? bank.packs;
  const signals = inferSelectionSignals(input, bank.semanticDomains);
  const variationSeed = deterministicHash([
    input.projectId ?? 'default-project',
    input.brief,
    input.skeletonId,
    signals.semanticDomainId ?? signals.productDomain,
  ].join('|'));
  const recentSelections = mergeRecentSelections(input.recentSelections, recentVisualSelectionMemory);

  const skeletonStage = filterVisualStage(
    'skeleton',
    packs,
    pack => isPackCompatibleWithSkeleton(pack, input.skeletonId),
  );
  const surfaceStage = filterVisualStage(
    'surface',
    skeletonStage.items,
    pack => intersects(pack.surfaces, signals.surfaces),
  );
  const domainStage = filterVisualStage(
    'domain',
    surfaceStage.items,
    pack => intersects(pack.domains, signals.domainTags) || signals.recommendedVisualPacks.includes(pack.skeleton),
  );
  const subdomainStage = filterVisualStage(
    'subdomain',
    domainStage.items,
    pack => signals.subdomains.length === 0 || intersects(pack.subdomains, signals.subdomains),
  );
  const toneStage = filterVisualStage(
    'tone',
    subdomainStage.items,
    pack => packMatchesToneProfiles(pack, signals),
  );
  const pipelineStages = [
    skeletonStage.audit,
    surfaceStage.audit,
    domainStage.audit,
    subdomainStage.audit,
    toneStage.audit,
  ];

  const candidates = toneStage.items
    .flatMap(pack => pack.variants
      .filter(variant => isVariantCompatibleWithSkeleton(variant, input.skeletonId))
      .filter(variant => variantMatchesToneProfiles(variant, signals))
      .map(variant => scoreCandidate({
        pack,
        variant: withSelectionSeed(variant, variationSeed),
        skeletonId: input.skeletonId,
        signals,
      })))
    .filter(candidate => candidate.relevanceScore > 0)
    .filter(candidate => candidateHasRequiredMeaning(candidate, signals))
    .sort(compareCandidatesByRelevance);

  if (candidates.length === 0) {
    const fallback = fallbackVisualSelection(input, signals, variationSeed, pipelineStages);
    rememberVisualSelection(fallback, input.skeletonId, signals);
    return fallback;
  }

  const initialBestRelevanceScore = candidates[0].relevanceScore;
  applyPreferredVariantFloor(candidates, initialBestRelevanceScore, signals);
  candidates.sort(compareCandidatesByRelevance);

  const bestRelevanceScore = candidates[0].relevanceScore;
  const relevanceWindow = relevanceWindowFor(signals);
  const minimumRelevanceFloor = minimumRelevanceFloorFor(candidates[0], signals);
  let viableByRelevance = candidates
    .filter(candidate =>
      candidate.relevanceScore >= bestRelevanceScore - relevanceWindow &&
      candidate.relevanceScore >= minimumRelevanceFloor
    )
    .sort(compareCandidatesByRelevance);

  viableByRelevance = expandViablePool({
    allCandidates: candidates,
    viable: viableByRelevance,
    bestRelevanceScore,
    relevanceWindow,
    minimumRelevanceFloor,
    signals,
  });

  const diversifiedPool = viableByRelevance
    .slice(0, isStrongSelectionSignals(signals) ? MAX_STRONG_POOL_SIZE : Math.max(1, MAX_STRONG_POOL_SIZE - 1))
    .map(candidate => withDiversityScore(candidate, signals, variationSeed, recentSelections));
  const finalPool = diversifiedPool
    .sort(compareCandidatesByFinalScore)
    .slice(0, isStrongSelectionSignals(signals) ? MAX_STRONG_POOL_SIZE : Math.max(1, MAX_STRONG_POOL_SIZE - 1));
  let selectedIndex = stableIndex(variationSeed, finalPool.length);
  let selected = finalPool[selectedIndex] ?? candidates[0];
  if (selected.antiRepeatPenalty > 0 && finalPool.length > 1) {
    const fresherPool = finalPool.filter(candidate => candidate.antiRepeatPenalty < selected.antiRepeatPenalty);
    if (fresherPool.length > 0) {
      selected = fresherPool[stableIndex(`${variationSeed}:fresh`, fresherPool.length)];
      selectedIndex = finalPool.indexOf(selected);
    }
  }
  const audit = selectionAudit({
    candidates,
    viableByRelevance,
    viableCandidates: finalPool,
    selected,
    selectedIndex,
    bestRelevanceScore,
    relevanceWindow,
    minimumRelevanceFloor,
    pipelineStages,
  });
  const selectedColorFamily = selectColorFamilyForCandidate(selected, signals, bank.colorFamilies, variationSeed, recentSelections);
  const selectedVariationPreset = selectVariationPresetForCandidate(selected, selectedColorFamily.id, signals, variationSeed, recentSelections);
  audit.pipelineStages.push(
    {
      stage: 'color-family',
      before: unique([
        ...signals.colorFamilyCandidates,
        selected.variant.colorFamily,
        ...selected.variant.colorFamilies,
        ...selected.pack.colorFamilies,
      ]).length,
      after: 1,
      retainedIds: [selectedColorFamily.id],
    },
    {
      stage: 'variation-seed',
      before: VARIATION_PRESET_OPTIONS.length,
      after: 1,
      retainedIds: [selectedVariationPreset.id],
    },
  );
  const selection = selectionFromCandidate(selected, signals, variationSeed, audit, selectedColorFamily, selectedVariationPreset);
  rememberVisualSelection(selection, input.skeletonId, signals);
  return selection;
}

function normalizePack(
  raw: VisualPackManifestSchema,
  manifestPath: string,
  variantsByPack: Map<string, Array<{ path: string; raw: VisualVariantSchema }>>,
): NormalizedVisualPack | null {
  const folderId = packIdFromPath(manifestPath);
  const packId = str(raw.id) || folderId || '';
  const skeleton = asSkeletonId(raw.skeleton) ?? asSkeletonId(packId);
  if (!packId || !skeleton) return null;

  const purpose = str(raw.purpose) || str(raw.description) || `${titleFromId(packId)} visual pack`;
  const compatibleSkeletons = normalizeSkeletons(raw.compatibleSkeletons, skeleton);
  const skeletonPath = str(raw.skeletonPath) || `skeletons/${skeleton}/`;
  const domains = unique([
    packId,
    skeleton,
    ...stringArray(raw.domains),
    ...(PACK_DOMAIN_ALIASES[skeleton] ?? []),
  ]);
  const subdomains = unique([
    ...stringArray(raw.subdomains),
    ...defaultSubdomainsForSkeleton(skeleton),
  ]);
  const surfaces = unique([
    ...stringArray(raw.surfaces),
    ...(SURFACE_BY_SKELETON[skeleton] ?? []),
  ]);
  const trustProfiles = unique([
    ...stringArray(raw.trustProfiles),
    defaultTrustProfileForSkeleton(skeleton),
  ]);
  const toneProfiles = unique([
    ...stringArray(raw.toneProfiles),
    'calm',
    'corporate',
  ]);
  const densityProfiles = unique([...stringArray(raw.densityProfiles), 'comfortable']);
  const radiusProfiles = unique([...stringArray(raw.radiusProfiles), 'soft']);
  const motionProfiles = unique([...stringArray(raw.motionProfiles), 'gentle']);
  const contrastProfiles = unique([...stringArray(raw.contrastProfiles), 'medium']);
  const layoutPatterns = unique([
    ...stringArray(raw.layoutPatterns),
    ...defaultLayoutPatternsForSkeleton(skeleton),
  ]);
  const componentFamilies = unique([
    ...stringArray(raw.componentFamilies),
    ...defaultComponentFamiliesForSkeleton(skeleton),
  ]);
  const colorFamilies = unique([
    ...stringArray(raw.colorFamilies),
    ...colorFamiliesForDomains(domains, subdomains),
    'neutral',
  ]);
  const requiredFiles = unique(stringArray(raw.requiredFiles));
  const forbiddenPatterns = unique(stringArray(raw.forbiddenPatterns));
  const requiredComponents = unique([
    ...stringArray(raw.requiredComponents),
    ...stringArray(raw.requiredBlocks),
  ]);
  const allowedSurfaces = unique([
    ...stringArray(raw.allowedSurfaces),
    ...surfaces,
  ]);
  const linkedStyleFiles = unique([
    ...stringArray(raw.linkedStyleFiles),
  ]);
  const linkedComponentFiles = unique([
    ...stringArray(raw.linkedComponentFiles),
    ...SURFACE_SOURCE_FILES[skeleton],
  ]);
  const layoutPresetFiles = unique(stringArray(raw.layoutPresetFiles));
  const motionPresetFiles = unique(stringArray(raw.motionPresetFiles));
  const assetReferenceFiles = unique(stringArray(raw.assetReferenceFiles));
  const materialFiles = unique([
    ...linkedStyleFiles,
    ...linkedComponentFiles,
    ...layoutPresetFiles,
    ...motionPresetFiles,
    ...assetReferenceFiles,
  ]);
  const priorityScore = typeof raw.priorityScore === 'number' ? raw.priorityScore : 0;

  const rawVariantEntries = (variantsByPack.get(packId) ?? [])
    .sort((a, b) => {
      const order = variantOrder(raw.variants, variantIdFromPath(a.path) ?? str(a.raw.id));
      const other = variantOrder(raw.variants, variantIdFromPath(b.path) ?? str(b.raw.id));
      return order - other || a.path.localeCompare(b.path);
    });
  const variants = rawVariantEntries.map(entry => normalizeVariant({
    raw: entry.raw,
    variantPath: entry.path,
    packId,
    skeleton,
    manifestPath,
    packDomains: domains,
    packSurfaces: surfaces,
    packSubdomains: subdomains,
    packColorFamilies: colorFamilies,
    packRequiredFiles: requiredFiles,
    packForbiddenPatterns: forbiddenPatterns,
  }));

  const sourceFiles = unique([
    manifestPath,
    'prototype-bank/design-packs/surfaces/manifest.json',
    ...SURFACE_SOURCE_FILES[skeleton],
    ...variants.flatMap(variant => variant.sourceFiles),
  ]);

  return {
    packId,
    manifestPath,
    selectedManifestPath: manifestPath,
    skeleton,
    purpose,
    whenToUse: unique(stringArray(raw.whenToUse)),
    requiredComponents,
    allowedSurfaces,
    linkedStyleFiles,
    linkedComponentFiles,
    layoutPresetFiles,
    motionPresetFiles,
    assetReferenceFiles,
    materialFiles,
    compatibleSkeletons,
    skeletonPath,
    domains,
    subdomains,
    surfaces,
    trustProfiles,
    toneProfiles,
    densityProfiles,
    radiusProfiles,
    motionProfiles,
    contrastProfiles,
    layoutPatterns,
    componentFamilies,
    colorFamilies,
    requiredBlocks: unique(stringArray(raw.requiredBlocks)),
    requiredFiles,
    forbiddenPatterns,
    antiRepeatGroup: str(raw.antiRepeatGroup) || `${packId}:pack`,
    priorityScore,
    variants,
    sourceFiles,
    raw,
  };
}

function normalizeVariant(input: {
  raw: VisualVariantSchema;
  variantPath: string;
  packId: string;
  skeleton: SkeletonId;
  manifestPath: string;
  packDomains: string[];
  packSurfaces: string[];
  packSubdomains: string[];
  packColorFamilies: string[];
  packRequiredFiles: string[];
  packForbiddenPatterns: string[];
}): NormalizedVisualVariant {
  const variantId = str(input.raw.id) || variantIdFromPath(input.variantPath) || 'default';
  const theme = str(input.raw.theme) || 'neutral';
  const spacing = str(input.raw.spacing) || 'comfortable';
  const typography = str(input.raw.typography) || 'sans-technical';
  const motionPreset = str(input.raw.motionPreset) || 'gentle';
  const targetUsers = str(input.raw.targetUsers) || `${input.packId} users`;
  const colorFamily = str(input.raw.colorFamily) || inferColorFamily(theme, variantId, targetUsers);
  const trustProfile = str(input.raw.trustProfile) || inferTrustProfile(theme, variantId, targetUsers);
  const toneProfile = str(input.raw.toneProfile) || inferToneProfile(theme, variantId, targetUsers);
  const densityProfile = str(input.raw.densityProfile) || inferDensityProfile(spacing, variantId);
  const radius = input.raw.radius ?? inferRadiusProfile(variantId);
  const radiusProfile = str(input.raw.radiusProfile) || inferRadiusProfile(variantId);
  const contrastProfile = str(input.raw.contrastProfile) || inferContrastProfile(theme, variantId, targetUsers);
  const domains = unique([
    ...input.packDomains,
    ...stringArray(input.raw.domains),
  ]);
  const subdomains = unique([
    ...input.packSubdomains,
    ...stringArray(input.raw.subdomains),
    ...subdomainsFromVariantText(`${variantId} ${theme} ${targetUsers}`),
  ]);
  const surfaces = unique([
    ...input.packSurfaces,
    ...stringArray(input.raw.surfaces),
  ]);
  const requiredFiles = unique([
    ...input.packRequiredFiles,
    ...stringArray(input.raw.requiredFiles),
  ]);
  const sourcePath = str(input.raw.sourcePath);
  const sourceFiles = unique([
    input.manifestPath,
    input.variantPath,
    sourcePath,
    ...stringArray(input.raw.sourceFiles),
    ...assetSourceFiles(theme, spacing, colorFamily),
    ...SURFACE_SOURCE_FILES[input.skeleton],
  ].filter(Boolean));
  const colorFamilies = unique([
    colorFamily,
    theme,
    ...input.packColorFamilies,
  ]);

  return {
    variantId,
    packId: input.packId,
    skeleton: input.skeleton,
    variantPath: input.variantPath,
    selectedVariantPath: input.variantPath,
    sourcePath: sourcePath || undefined,
    name: str(input.raw.name) || titleFromId(variantId),
    theme,
    spacing,
    typography,
    radius,
    motionPreset,
    densityProfile,
    radiusProfile,
    contrastProfile,
    trustProfile,
    toneProfile,
    domains,
    subdomains,
    surfaces,
    colorFamily,
    colorFamilies,
    targetUsers,
    tokenHints: unique([
      ...stringArray(input.raw.tokenHints),
      `theme:${theme}`,
      `spacing:${spacing}`,
      `typography:${typography}`,
      `radius:${typeof radius === 'string' ? radius : JSON.stringify(radius)}`,
      `motion:${motionPreset}`,
    ]),
    componentHints: unique([
      ...stringArray(input.raw.componentHints),
      ...componentHintsFromRaw(input.raw),
    ]),
    layoutHints: unique([
      ...stringArray(input.raw.layoutHints),
      ...layoutHintsFromRaw(input.raw),
    ]),
    forbiddenPatterns: unique([
      ...input.packForbiddenPatterns,
      ...stringArray(input.raw.forbiddenPatterns),
    ]),
    requiredFiles,
    sourceFiles,
    variationSeed: deterministicHash(`${input.packId}:${variantId}`),
    antiRepeatGroup: `${input.packId}:${variantId}:${colorFamily}`,
    raw: input.raw,
  };
}

function inferSelectionSignals(
  input: ResolveVisualSelectionInput,
  semanticDomains: SemanticDomainManifestSchema[],
): VisualSelectionSignals {
  const brief = input.brief ?? '';
  const semanticDomainId =
    normalizeSemanticDomainId(input.semanticDomainId) ??
    normalizeSemanticDomainId(input.semanticDomain?.id) ??
    inferSemanticDomainId(brief, semanticDomains);
  const semanticDomain = input.semanticDomain ?? semanticDomains.find(domain => domain.id === semanticDomainId) ?? null;
  const bridge = semanticDomain ? bridgeForSemanticDomain(semanticDomain) : bridgeForSemanticDomainId(semanticDomainId);
  const productDomain = inferProductDomain(brief, input.skeletonId);
  const domainTags = unique([
    productDomain,
    semanticDomainId ?? '',
    ...domainAliases(productDomain),
    ...domainAliases(semanticDomainId),
  ]);
  const explicitSubdomains = unique([
    ...subdomainsFromBrief(brief),
    input.subdomain ?? '',
  ].filter(Boolean));
  const surfaces = unique([
    ...(SURFACE_BY_SKELETON[input.skeletonId] ?? []),
    ...surfaceHintsFromBrief(brief),
    input.surface ?? '',
  ].filter(Boolean));
  const subdomains = unique([
    ...domainTags.flatMap(tag => DOMAIN_SUBDOMAIN_REGISTRY[tag] ?? []),
    ...stringArray(semanticDomain?.subdomains),
    ...bridge.subdomains,
    ...explicitSubdomains,
    input.subdomain ?? '',
  ].filter(Boolean));
  const productTone = inferProductToneParameters(brief, input.tone, input.productTone);
  const toneProfiles = unique([
    ...bridge.toneProfiles,
    ...toneHintsFromBrief(brief),
    ...toneProfilesFromProductTone(productTone),
    input.tone ?? '',
  ].filter(Boolean));
  const colorFamilyCandidates = unique([
    ...stringArray(semanticDomain?.colorFamilies),
    ...colorFamiliesForDomains(domainTags, subdomains),
  ]);

  return {
    semanticDomainId: semanticDomainId ?? null,
    productDomain,
    domainTags,
    selectedSurface: input.surface || surfaces[0] || '',
    selectedSubdomain: input.subdomain || explicitSubdomains[0] || subdomains[0] || '',
    productTone,
    subdomains,
    surfaces,
    toneProfiles,
    colorFamilyCandidates,
    preferredVariants: bridge.preferredVariants,
    recommendedVisualPacks: bridge.recommendedVisualPacks,
    recommendedDesign: semanticDomain?.recommendedDesign ?? bridge.recommendedDesign,
    allowToneRepeat: briefAllowsToneRepeat(brief),
  };
}

function bridgeForSemanticDomain(domain: SemanticDomainManifestSchema): {
  recommendedVisualPacks: SkeletonId[];
  preferredVariants: string[];
  subdomains: string[];
  toneProfiles: string[];
  recommendedDesign: string | null;
} {
  const byId = bridgeForSemanticDomainId(domain.id);
  if (domain.id === 'social') return byId;
  const byDesign = bridgeForRecommendedDesign(domain.recommendedDesign);
  return {
    recommendedVisualPacks: uniqueSkeletons([...byId.recommendedVisualPacks, ...byDesign.recommendedVisualPacks]),
    preferredVariants: unique([...byId.preferredVariants, ...byDesign.preferredVariants]),
    subdomains: unique([...byId.subdomains, ...byDesign.subdomains, ...stringArray(domain.subdomains)]),
    toneProfiles: unique([...byId.toneProfiles, ...byDesign.toneProfiles]),
    recommendedDesign: domain.recommendedDesign ?? byId.recommendedDesign ?? byDesign.recommendedDesign,
  };
}

function bridgeForSemanticDomainId(id: string | null | undefined): ReturnType<typeof bridgeForRecommendedDesign> {
  switch (id) {
    case 'health':
    case 'medicine':
      return {
        recommendedVisualPacks: ['saas-dashboard', 'mobile-app', 'productivity-tool', 'landing-page', 'social-community'],
        preferredVariants: ['clinical', 'calm', 'mobile-soft'],
        subdomains: [
          'clinical',
          'healthcare',
          'clinic',
          'patient-care',
          'care-team',
          'wellness',
          'habit-fitness',
          'women-health',
          'supplements-nutrition',
          'nutrition',
          'mental-health',
        ],
        toneProfiles: ['clinical', 'calm', 'trustworthy'],
        recommendedDesign: 'trust-medical',
      };
    case 'wellness':
      return {
        recommendedVisualPacks: ['mobile-app', 'productivity-tool', 'landing-page', 'social-community'],
        preferredVariants: ['mobile-soft', 'calm', 'clinical'],
        subdomains: ['wellness', 'habit-tracking', 'habit-fitness', 'self-care', 'daily-focus', 'mental-health'],
        toneProfiles: ['soft', 'calm', 'wellness'],
        recommendedDesign: 'light-clean',
      };
    case 'fintech':
      return {
        recommendedVisualPacks: ['saas-dashboard', 'productivity-tool', 'mobile-app', 'landing-page', 'ecommerce'],
        preferredVariants: ['fintech-corporate', 'premium-dark'],
        subdomains: ['finance-ops', 'banking', 'payments', 'wallet', 'compliance'],
        toneProfiles: ['corporate', 'premium', 'trustworthy'],
        recommendedDesign: 'dark-premium',
      };
    case 'social':
      return {
        recommendedVisualPacks: ['social-community', 'mobile-app', 'landing-page', 'ecommerce'],
        preferredVariants: ['creator-social', 'playful', 'premium-dark'],
        subdomains: ['creator-network', 'feed', 'community', 'profile'],
        toneProfiles: ['creator', 'social', 'playful'],
        recommendedDesign: 'dark-premium',
      };
    case 'gaming':
      return {
        recommendedVisualPacks: ['mobile-app', 'social-community', 'landing-page'],
        preferredVariants: ['playful', 'premium-dark', 'minimal-brutal'],
        subdomains: ['game-loop', 'leaderboard', 'achievement', 'community'],
        toneProfiles: ['playful', 'energetic', 'premium'],
        recommendedDesign: 'neon-dark',
      };
    case 'ai-tools':
      return {
        recommendedVisualPacks: ['productivity-tool', 'saas-dashboard', 'mobile-app', 'landing-page'],
        preferredVariants: ['premium-dark', 'fintech-corporate', 'minimal-brutal'],
        subdomains: ['ai-workspace', 'prompting', 'automation', 'assistant'],
        toneProfiles: ['corporate', 'premium', 'minimal'],
        recommendedDesign: 'dark-premium',
      };
    default:
      return bridgeForRecommendedDesign(null);
  }
}

function bridgeForRecommendedDesign(recommendedDesign?: string | null): {
  recommendedVisualPacks: SkeletonId[];
  preferredVariants: string[];
  subdomains: string[];
  toneProfiles: string[];
  recommendedDesign: string | null;
} {
  switch (recommendedDesign) {
    case 'trust-medical':
      return {
        recommendedVisualPacks: ['saas-dashboard', 'mobile-app', 'productivity-tool', 'social-community'],
        preferredVariants: ['clinical', 'calm', 'mobile-soft'],
        subdomains: ['healthcare', 'clinic', 'patient-care'],
        toneProfiles: ['clinical', 'calm', 'trustworthy'],
        recommendedDesign,
      };
    case 'light-clean':
      return {
        recommendedVisualPacks: ['mobile-app', 'productivity-tool', 'landing-page'],
        preferredVariants: ['calm', 'mobile-soft'],
        subdomains: ['wellness', 'consumer-mobile', 'daily-focus'],
        toneProfiles: ['calm', 'soft'],
        recommendedDesign,
      };
    case 'dark-premium':
      return {
        recommendedVisualPacks: ['saas-dashboard', 'productivity-tool', 'mobile-app', 'landing-page', 'social-community'],
        preferredVariants: ['premium-dark', 'fintech-corporate'],
        subdomains: ['premium', 'finance-ops', 'workspace'],
        toneProfiles: ['premium', 'corporate'],
        recommendedDesign,
      };
    case 'neon-dark':
      return {
        recommendedVisualPacks: ['mobile-app', 'social-community', 'landing-page'],
        preferredVariants: ['playful', 'premium-dark'],
        subdomains: ['gaming', 'community'],
        toneProfiles: ['playful', 'energetic'],
        recommendedDesign,
      };
    default:
      return {
        recommendedVisualPacks: [],
        preferredVariants: [],
        subdomains: [],
        toneProfiles: [],
        recommendedDesign: recommendedDesign ?? null,
      };
  }
}

function normalizeColorFamily(raw: ColorFamilyManifestSchema, sourcePath: string): NormalizedColorFamily {
  const id = str(raw.id) || colorFamilyIdFromPath(sourcePath) || 'neutral';
  return {
    id,
    name: str(raw.name) || titleFromId(id),
    sourcePath,
    domains: unique([
      ...stringArray(raw.domains),
      ...domainAliases(id),
      ...inferDomainsForColorFamily(id),
    ]),
    subdomains: unique([
      ...stringArray(raw.subdomains),
      ...subdomainsFromVariantText(id),
    ]),
    toneProfiles: unique([
      ...stringArray(raw.toneProfiles),
      inferToneProfile(id, id, id),
    ]),
    trustProfiles: unique([
      ...stringArray(raw.trustProfiles),
      inferTrustProfile(id, id, id),
    ]),
    densityProfiles: unique([
      ...stringArray(raw.densityProfiles),
      id.includes('compact') ? 'compact' : 'comfortable',
    ]),
    contrastProfiles: unique([
      ...stringArray(raw.contrastProfiles),
      inferContrastProfile(id, id, id),
    ]),
    tokens: completeColorTokens(raw.tokens, id, raw.chartPalette),
    raw,
  };
}

function completeColorTokens(
  tokens: Partial<ColorFamilyTokenMap> | undefined,
  familyId: string,
  chartPalette?: string[],
): ColorFamilyTokenMap {
  const fallback = defaultColorTokens(familyId);
  const palette = Array.isArray(tokens?.chartPalette)
    ? tokens.chartPalette
    : Array.isArray(chartPalette)
      ? chartPalette
      : fallback.chartPalette;
  return {
    background: str(tokens?.background) || fallback.background,
    foreground: str(tokens?.foreground) || fallback.foreground,
    muted: str(tokens?.muted) || fallback.muted,
    card: str(tokens?.card) || fallback.card,
    primary: str(tokens?.primary) || fallback.primary,
    secondary: str(tokens?.secondary) || fallback.secondary,
    accent: str(tokens?.accent) || fallback.accent,
    border: str(tokens?.border) || fallback.border,
    success: str(tokens?.success) || fallback.success,
    warning: str(tokens?.warning) || fallback.warning,
    danger: str(tokens?.danger) || fallback.danger,
    chartPalette: palette.filter((item): item is string => typeof item === 'string' && item.trim().length > 0),
  };
}

function defaultColorTokens(familyId: string): ColorFamilyTokenMap {
  switch (familyId) {
    case 'clinical-teal':
      return tokenMap('174 55% 98%', '181 45% 14%', '174 24% 91%', '0 0% 100%', '174 72% 32%', '184 26% 88%', '199 68% 44%', '180 18% 82%', ['174 72% 32%', '199 68% 44%', '160 58% 38%', '221 48% 42%']);
    case 'wellness-sage':
      return tokenMap('96 32% 96%', '142 28% 18%', '94 22% 88%', '90 36% 99%', '142 35% 36%', '82 28% 86%', '38 72% 58%', '96 18% 80%', ['142 35% 36%', '82 38% 42%', '38 72% 58%', '174 40% 42%']);
    case 'soft-womens-health':
      return tokenMap('340 64% 98%', '335 35% 18%', '338 42% 91%', '0 0% 100%', '335 74% 52%', '326 42% 89%', '18 84% 64%', '334 26% 84%', ['335 74% 52%', '18 84% 64%', '287 50% 58%', '352 58% 54%']);
    case 'nutrition-amber-green':
      return tokenMap('44 86% 96%', '100 28% 16%', '54 44% 88%', '0 0% 100%', '93 46% 35%', '42 82% 86%', '36 92% 50%', '50 32% 78%', ['93 46% 35%', '36 92% 50%', '142 50% 42%', '24 76% 52%']);
    case 'calm-lavender':
      return tokenMap('250 52% 98%', '252 32% 18%', '250 34% 91%', '0 0% 100%', '256 52% 54%', '246 38% 90%', '196 64% 47%', '248 24% 84%', ['256 52% 54%', '196 64% 47%', '286 46% 58%', '222 52% 52%']);
    case 'medical-navy-teal':
      return tokenMap('210 42% 8%', '190 36% 96%', '207 32% 16%', '210 38% 11%', '181 72% 42%', '207 28% 20%', '199 84% 56%', '205 25% 24%', ['181 72% 42%', '199 84% 56%', '160 58% 48%', '220 68% 62%']);
    case 'fintech-indigo':
      return tokenMap('226 42% 8%', '225 45% 96%', '229 28% 17%', '226 36% 12%', '238 76% 62%', '226 30% 20%', '174 70% 46%', '226 22% 25%', ['238 76% 62%', '174 70% 46%', '262 68% 62%', '199 84% 56%']);
    case 'gaming-neon':
      return tokenMap('260 50% 7%', '210 40% 98%', '260 36% 17%', '260 48% 11%', '286 100% 66%', '210 34% 18%', '174 100% 50%', '260 28% 28%', ['286 100% 66%', '174 100% 50%', '45 100% 58%', '330 92% 62%']);
    case 'luxury-dark-gold':
      return tokenMap('42 30% 7%', '42 48% 94%', '42 20% 16%', '40 28% 11%', '43 76% 56%', '39 24% 18%', '18 72% 58%', '42 18% 24%', ['43 76% 56%', '18 72% 58%', '148 42% 42%', '215 28% 64%']);
    case 'playful-coral':
      return tokenMap('18 86% 97%', '15 34% 17%', '18 60% 90%', '0 0% 100%', '8 86% 58%', '38 86% 88%', '190 76% 44%', '18 35% 82%', ['8 86% 58%', '190 76% 44%', '42 92% 52%', '330 70% 58%']);
    case 'cool-blue':
      return tokenMap('210 58% 98%', '218 38% 16%', '214 38% 91%', '0 0% 100%', '211 78% 46%', '212 42% 88%', '185 70% 42%', '214 28% 82%', ['211 78% 46%', '185 70% 42%', '238 58% 58%', '160 52% 42%']);
    default:
      return tokenMap('0 0% 98%', '240 10% 12%', '240 6% 91%', '0 0% 100%', '240 5% 28%', '240 5% 88%', '218 48% 48%', '240 6% 84%', ['240 5% 28%', '218 48% 48%', '160 52% 42%', '36 84% 52%']);
  }
}

function tokenMap(
  background: string,
  foreground: string,
  muted: string,
  card: string,
  primary: string,
  secondary: string,
  accent: string,
  border: string,
  chartPalette: string[],
): ColorFamilyTokenMap {
  return {
    background,
    foreground,
    muted,
    card,
    primary,
    secondary,
    accent,
    border,
    success: '142 56% 40%',
    warning: '38 92% 50%',
    danger: '0 72% 50%',
    chartPalette,
  };
}

function filterVisualStage(
  stage: string,
  input: NormalizedVisualPack[],
  predicate: (pack: NormalizedVisualPack) => boolean,
): {
  items: NormalizedVisualPack[];
  audit: VisualSelectionAudit['pipelineStages'][number];
} {
  const filtered = input.filter(predicate);
  const fallbackToPrevious = filtered.length === 0 && input.length > 0;
  const items = fallbackToPrevious ? input : filtered;
  return {
    items,
    audit: {
      stage,
      before: input.length,
      after: filtered.length,
      retainedIds: items.map(pack => pack.packId),
      fallbackToPrevious: fallbackToPrevious || undefined,
    },
  };
}

function mergeRecentSelections(
  explicit: RecentVisualSelection[] | undefined,
  memory: RecentVisualSelection[],
): RecentVisualSelection[] {
  const seen = new Set<string>();
  const out: RecentVisualSelection[] = [];
  for (const item of [...(explicit ?? []), ...memory]) {
    const key = [
      item.skeletonId ?? '',
      item.domain ?? '',
      item.semanticDomainId ?? '',
      item.selectedPackId ?? '',
      item.selectedVariantId ?? '',
      item.colorFamily ?? '',
      item.variationPresetId ?? '',
      item.antiRepeatGroup ?? '',
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out.slice(-8);
}

function rememberVisualSelection(
  selection: VisualSelection,
  skeletonId: SkeletonId,
  signals: VisualSelectionSignals,
): void {
  recentVisualSelectionMemory.push({
    skeletonId,
    domain: signals.productDomain,
    semanticDomainId: signals.semanticDomainId,
    selectedPackId: selection.selectedPackId,
    selectedVariantId: selection.selectedVariantId,
    antiRepeatGroup: selection.antiRepeatGroup,
    colorFamily: selection.colorFamily,
    variationPresetId: selection.variationPreset.id,
    productToneSignature: toneSignature(signals.productTone),
  });
  if (recentVisualSelectionMemory.length > 12) {
    recentVisualSelectionMemory.splice(0, recentVisualSelectionMemory.length - 12);
  }
}

function isPackCompatibleWithSkeleton(pack: NormalizedVisualPack, skeletonId: SkeletonId): boolean {
  if (!pack.compatibleSkeletons.includes(skeletonId)) return false;
  return packMatchesCompatibilityContract(pack, getSkeletonVisualCompatibility(skeletonId));
}

function packMatchesCompatibilityContract(
  pack: NormalizedVisualPack,
  contract: SkeletonVisualCompatibilityContract,
): boolean {
  return (
    intersects(pack.surfaces, contract.allowedSurfaces) &&
    intersects(pack.layoutPatterns, contract.allowedLayoutPatterns) &&
    intersects(pack.densityProfiles, contract.allowedDensityProfiles) &&
    intersects(pack.motionProfiles, contract.allowedMotionProfiles) &&
    intersects(pack.componentFamilies, contract.allowedComponentFamilies)
  );
}

function isVariantCompatibleWithSkeleton(variant: NormalizedVisualVariant, skeletonId: SkeletonId): boolean {
  const contract = getSkeletonVisualCompatibility(skeletonId);
  if (!contract.allowedDensityProfiles.includes(variant.densityProfile)) return false;
  if (!contract.allowedMotionProfiles.includes(variant.motionPreset)) return false;
  const text = [
    variant.variantId,
    variant.name,
    variant.layoutHints.join(' '),
    variant.componentHints.join(' '),
    variant.targetUsers,
  ].join(' ').toLowerCase();
  return !contract.forbiddenVisualPatterns.some(pattern =>
    text.includes(pattern.toLowerCase()),
  );
}

function packMatchesToneProfiles(pack: NormalizedVisualPack, signals: VisualSelectionSignals): boolean {
  return (
    intersects(pack.toneProfiles, signals.toneProfiles) ||
    intersects(pack.trustProfiles, trustProfilesForLevel(signals.productTone.trust_level)) ||
    pack.densityProfiles.includes(signals.productTone.density) ||
    pack.radiusProfiles.includes(signals.productTone.radius_profile) ||
    pack.motionProfiles.includes(signals.productTone.motion_profile) ||
    pack.contrastProfiles.includes(signals.productTone.contrast_profile)
  );
}

function variantMatchesToneProfiles(variant: NormalizedVisualVariant, signals: VisualSelectionSignals): boolean {
  if (signals.preferredVariants.includes(variant.variantId)) return true;
  if (isSemanticNeighborVariant(variant.variantId, signals)) return true;
  if (signals.toneProfiles.includes(variant.toneProfile)) return true;
  if (profileMatchesTrustLevel(variant.trustProfile, signals.productTone.trust_level)) return true;
  if (variant.densityProfile === signals.productTone.density) return true;
  if (variant.motionPreset === signals.productTone.motion_profile) return true;
  if (variant.contrastProfile === signals.productTone.contrast_profile) return true;
  return !isStrongSelectionSignals(signals);
}

function selectColorFamilyForCandidate(
  candidate: VisualCandidate,
  signals: VisualSelectionSignals,
  families: NormalizedColorFamily[],
  variationSeed: string,
  recentSelections: RecentVisualSelection[],
): NormalizedColorFamily {
  const familyMap = new Map(families.map(family => [family.id, family]));
  const preferredFamilyId = preferredColorFamilyForSignals(signals);
  if (preferredFamilyId && familyMap.has(preferredFamilyId)) {
    return familyMap.get(preferredFamilyId)!;
  }
  const ids = unique([
    ...signals.colorFamilyCandidates,
    candidate.variant.colorFamily,
    ...candidate.variant.colorFamilies,
    ...candidate.pack.colorFamilies,
  ]).filter(id => familyMap.has(id));
  const candidates = (ids.length > 0 ? ids : ['neutral'])
    .map(id => familyMap.get(id) ?? normalizeColorFamily({ id }, `prototype-bank/design-packs/assets/color-ramps/${id}.json`))
    .map(family => {
      let score = 0;
      if (signals.colorFamilyCandidates.includes(family.id)) score += 18;
      if (family.id === candidate.variant.colorFamily) score += 12;
      if (intersects(family.domains, signals.domainTags)) score += 12;
      if (intersects(family.subdomains, signals.subdomains)) score += 10;
      if (signals.selectedSubdomain && family.subdomains.includes(signals.selectedSubdomain)) score += 16;
      if (intersects(family.toneProfiles, signals.toneProfiles)) score += 6;
      if (profileMatchesTrustLevel(family.trustProfiles[0] ?? '', signals.productTone.trust_level)) score += 4;
      score += stableIndex(deterministicHash(`${family.id}:${variationSeed}:color`), 7);
      for (const recent of recentSelections) {
        const sameDomain = !recent.domain || signals.domainTags.includes(recent.domain);
        if (!sameDomain) continue;
        if (recent.colorFamily === family.id) score -= signals.allowToneRepeat ? 2 : 9;
      }
      return { family, score };
    })
    .sort((a, b) => b.score - a.score || a.family.id.localeCompare(b.family.id));
  const bestScore = candidates[0]?.score ?? 0;
  const top = candidates.filter(candidate => candidate.score >= bestScore - 4).slice(0, 4);
  return top[stableIndex(`${variationSeed}:color-family`, top.length)]?.family ?? candidates[0]?.family ?? normalizeColorFamily({ id: 'neutral' }, 'prototype-bank/design-packs/assets/color-ramps/neutral.json');
}

function selectVariationPresetForCandidate(
  candidate: VisualCandidate,
  colorFamilyId: string,
  signals: VisualSelectionSignals,
  variationSeed: string,
  recentSelections: RecentVisualSelection[],
): VariationPreset {
  const contract = getSkeletonVisualCompatibility(candidate.variant.skeleton);
  const scored = VARIATION_PRESET_OPTIONS
    .filter(preset => contract.allowedDensityProfiles.includes(preset.spacingPreset))
    .filter(preset => contract.allowedMotionProfiles.includes(preset.motionPreset))
    .map(preset => {
      let score = 0;
      if (preset.spacingPreset === signals.productTone.density) score += 10;
      if (preset.radiusPreset === signals.productTone.radius_profile) score += 8;
      if (preset.motionPreset === signals.productTone.motion_profile) score += 8;
      if (preset.spacingPreset === candidate.variant.densityProfile) score += 6;
      if (preset.motionPreset === candidate.variant.motionPreset) score += 6;
      if (preset.radiusPreset === candidate.variant.radiusProfile) score += 6;
      if (signals.selectedSurface.includes('dashboard') && preset.blockEmphasisPreset === 'data-first') score += 6;
      if (signals.selectedSurface.includes('feed') && preset.blockEmphasisPreset === 'content-first') score += 5;
      if (signals.selectedSubdomain.includes('nutrition') && preset.blockEmphasisPreset === 'action-first') score += 5;
      score += stableIndex(deterministicHash(`${preset.id}:${colorFamilyId}:${variationSeed}`), 6);
      for (const recent of recentSelections) {
        if (recent.variationPresetId === preset.id) score -= signals.allowToneRepeat ? 2 : 8;
      }
      return { preset, score };
    })
    .sort((a, b) => b.score - a.score || a.preset.id.localeCompare(b.preset.id));
  const selected = scored[stableIndex(`${variationSeed}:variation`, Math.min(3, scored.length || 1))] ?? scored[0];
  const preset = selected?.preset ?? VARIATION_PRESET_OPTIONS[0];
  return {
    ...preset,
    visualPackVariant: candidate.variant.variantId,
    colorFamilyVariant: colorFamilyId,
  };
}

function inferProductToneParameters(
  brief: string,
  tone: string | null | undefined,
  override?: Partial<ProductToneParameters>,
): ProductToneParameters {
  const text = `${brief} ${tone ?? ''}`.toLowerCase();
  let inferred: ProductToneParameters = {
    trust_level: 'medium',
    energy_level: 'balanced',
    density: 'comfortable',
    radius_profile: 'soft',
    motion_profile: 'gentle',
    contrast_profile: 'medium',
  };
  if (/(clinical|clinic|medical|patient|doctor|hospital|compliance|regulated)/.test(text)) {
    inferred = {
      trust_level: 'regulated',
      energy_level: 'calm',
      density: 'comfortable',
      radius_profile: 'sharp',
      motion_profile: 'reduced',
      contrast_profile: 'medium',
    };
  } else if (/(finance|fintech|bank|payment|wallet|enterprise|corporate)/.test(text)) {
    inferred = {
      trust_level: 'high',
      energy_level: 'balanced',
      density: 'compact',
      radius_profile: 'sharp',
      motion_profile: 'reduced',
      contrast_profile: 'high',
    };
  } else if (/(women|fertility|cycle|pregnancy|self-care|wellness|mindful|mental|therapy|calm)/.test(text)) {
    inferred = {
      trust_level: 'high',
      energy_level: 'calm',
      density: 'spacious',
      radius_profile: 'pill',
      motion_profile: 'gentle',
      contrast_profile: 'low',
    };
  } else if (/(nutrition|supplement|meal|fitness|habit|workout)/.test(text)) {
    inferred = {
      trust_level: 'medium',
      energy_level: 'balanced',
      density: 'comfortable',
      radius_profile: 'soft',
      motion_profile: 'gentle',
      contrast_profile: 'medium',
    };
  } else if (/(game|playful|creator|community|social)/.test(text)) {
    inferred = {
      trust_level: 'medium',
      energy_level: 'energetic',
      density: 'spacious',
      radius_profile: 'pill',
      motion_profile: 'expressive',
      contrast_profile: 'high',
    };
  }
  return {
    trust_level: override?.trust_level ?? inferred.trust_level,
    energy_level: override?.energy_level ?? inferred.energy_level,
    density: override?.density ?? inferred.density,
    radius_profile: override?.radius_profile ?? inferred.radius_profile,
    motion_profile: override?.motion_profile ?? inferred.motion_profile,
    contrast_profile: override?.contrast_profile ?? inferred.contrast_profile,
  };
}

function toneProfilesFromProductTone(tone: ProductToneParameters): string[] {
  const profiles: string[] = [];
  if (tone.trust_level === 'regulated') profiles.push('clinical', 'trustworthy');
  if (tone.trust_level === 'high') profiles.push('premium', 'trustworthy');
  if (tone.energy_level === 'calm') profiles.push('calm', 'soft');
  if (tone.energy_level === 'energetic') profiles.push('playful', 'creator');
  if (tone.density === 'compact') profiles.push('corporate', 'minimal');
  return unique(profiles);
}

function trustProfilesForLevel(level: TrustLevel): string[] {
  switch (level) {
    case 'regulated': return ['clinical-trust', 'financial-trust'];
    case 'high': return ['enterprise-trust', 'financial-trust', 'clinical-trust', 'operator-trust'];
    case 'medium': return ['consumer-trust', 'workspace-trust', 'commerce-trust', 'community-trust'];
    case 'low': return ['general-trust', 'creator-trust'];
  }
}

function profileMatchesTrustLevel(profile: string, level: TrustLevel): boolean {
  return trustProfilesForLevel(level).includes(profile);
}

function toneSignature(tone: ProductToneParameters): string {
  return [
    tone.trust_level,
    tone.energy_level,
    tone.density,
    tone.radius_profile,
    tone.motion_profile,
    tone.contrast_profile,
  ].join('/');
}

function briefAllowsToneRepeat(brief: string): boolean {
  return /\b(same tone|same look|matching style|keep the same|as before|такой же тон|такой же стиль|как раньше|как до этого)\b/i.test(brief);
}

function scoreCandidate(input: {
  pack: NormalizedVisualPack;
  variant: NormalizedVisualVariant;
  skeletonId: SkeletonId;
  signals: VisualSelectionSignals;
}): VisualCandidate {
  const { pack, variant, skeletonId, signals } = input;
  let skeletonFit = 0;
  let domainFit = 0;
  let toneFit = 0;
  let surfaceFit = 0;
  const relevanceReasons: string[] = [];
  const add = (
    axis: 'skeleton' | 'domain' | 'tone' | 'surface',
    points: number,
    reason: string,
  ) => {
    if (axis === 'skeleton') skeletonFit += points;
    if (axis === 'domain') domainFit += points;
    if (axis === 'tone') toneFit += points;
    if (axis === 'surface') surfaceFit += points;
    relevanceReasons.push(`${reason}:+${points}`);
  };
  const contract = getSkeletonVisualCompatibility(skeletonId);

  if (pack.compatibleSkeletons.includes(skeletonId)) add('skeleton', 80, 'skeleton-compatible');
  if (pack.skeleton === skeletonId) add('skeleton', 20, 'skeleton-exact');
  if (packMatchesCompatibilityContract(pack, contract)) add('skeleton', 24, 'skeleton-contract');
  if (contract.allowedDensityProfiles.includes(variant.densityProfile)) add('skeleton', 5, 'density-contract');
  if (contract.allowedMotionProfiles.includes(variant.motionPreset)) add('skeleton', 5, 'motion-contract');

  if (intersects(pack.surfaces, signals.surfaces)) add('surface', 18, 'surface');
  if (pack.surfaces.includes(signals.selectedSurface)) add('surface', 8, 'selected-surface');
  if (intersects(pack.layoutPatterns, contract.allowedLayoutPatterns)) add('surface', 8, 'layout-pattern-contract');
  if (intersects(pack.componentFamilies, contract.allowedComponentFamilies)) add('surface', 8, 'component-family-contract');

  if (intersects(pack.domains, signals.domainTags)) add('domain', 24, 'domain-tags');
  if (intersects(variant.domains, signals.domainTags)) add('domain', 12, 'variant-domain-tags');
  if (signals.recommendedVisualPacks.includes(pack.skeleton)) add('domain', 18, 'semantic-pack-bridge');
  if (intersects(pack.subdomains, signals.subdomains)) add('domain', 18, 'subdomain');
  if (variant.subdomains.includes(signals.selectedSubdomain)) add('domain', 10, 'selected-subdomain');
  if (signals.productDomain === pack.skeleton) add('domain', 8, 'product-skeleton');

  const semanticNeighbor = isSemanticNeighborVariant(variant.variantId, signals);
  const exactMatch =
    signals.preferredVariants.includes(variant.variantId) ||
    signals.toneProfiles.includes(variant.toneProfile) ||
    signals.toneProfiles.some(tone => variant.variantId.includes(tone));

  if (signals.preferredVariants.includes(variant.variantId)) add('tone', 18, 'preferred-variant');
  if (signals.toneProfiles.includes(variant.toneProfile)) add('tone', 14, 'tone-profile');
  if (signals.toneProfiles.some(tone => variant.variantId.includes(tone))) add('tone', 12, 'tone-in-variant');
  if (signals.toneProfiles.some(tone => variant.targetUsers.toLowerCase().includes(tone))) add('tone', 5, 'tone-in-users');
  if (signals.semanticDomainId && variant.targetUsers.toLowerCase().includes(signals.semanticDomainId)) add('domain', 6, 'semantic-in-users');
  if (semanticNeighbor) add('domain', 12, 'semantic-neighbor');
  if (profileMatchesTrustLevel(variant.trustProfile, signals.productTone.trust_level)) add('tone', 8, 'trust-level');
  if (variant.densityProfile === signals.productTone.density) add('tone', 6, 'tone-density');
  if (variant.radiusProfile === signals.productTone.radius_profile) add('tone', 6, 'tone-radius');
  if (variant.motionPreset === signals.productTone.motion_profile) add('tone', 6, 'tone-motion');
  if (variant.contrastProfile === signals.productTone.contrast_profile) add('tone', 6, 'tone-contrast');
  if (intersects(variant.colorFamilies, signals.colorFamilyCandidates)) add('tone', 6, 'tone-color-family');
  const relevanceScore = skeletonFit + domainFit + toneFit + surfaceFit + pack.priorityScore;
  if (pack.priorityScore) relevanceReasons.push(`pack-priority:+${pack.priorityScore}`);

  return {
    pack,
    variant,
    skeletonFit,
    domainFit,
    toneFit,
    surfaceFit,
    relevanceScore,
    diversityScore: 0,
    score: relevanceScore,
    relevanceReasons,
    diversityReasons: [],
    antiRepeatPenalty: 0,
    antiRepeatBonus: 0,
    semanticNeighbor,
    exactMatch,
  };
}

function selectionFromCandidate(
  candidate: VisualCandidate,
  signals: VisualSelectionSignals,
  variationSeed: string,
  audit: VisualSelectionAudit,
  selectedColorFamily: NormalizedColorFamily,
  variationPreset: VariationPreset,
): VisualSelection {
  const pack = candidate.pack;
  const variant = withSelectionSeed(candidate.variant, variationSeed);
  const requiredFiles = unique([
    ...pack.requiredFiles,
    ...variant.requiredFiles,
  ]);
  const selectedThemeFile = `prototype-bank/design-packs/foundation/themes/${variant.theme}.css`;
  const sourceFiles = unique([
    pack.manifestPath,
    variant.variantPath,
    selectedColorFamily.sourcePath,
    ...variant.sourceFiles,
  ]);
  const materialFiles = unique([
    ...pack.materialFiles,
    ...requiredFiles,
    ...sourceFiles,
    selectedThemeFile,
  ]);

  return {
    selectedPackId: pack.packId,
    selectedVariantId: variant.variantId,
    selectedVariantPath: variant.variantPath,
    selectedManifestPath: pack.manifestPath,
    selectedThemeFile,
    purpose: pack.purpose,
    whenToUse: pack.whenToUse,
    requiredComponents: pack.requiredComponents,
    allowedSurfaces: pack.allowedSurfaces,
    linkedStyleFiles: pack.linkedStyleFiles,
    linkedComponentFiles: pack.linkedComponentFiles,
    layoutPresetFiles: pack.layoutPresetFiles,
    motionPresetFiles: pack.motionPresetFiles,
    assetReferenceFiles: pack.assetReferenceFiles,
    materialFiles,
    compatibleSkeletons: pack.compatibleSkeletons,
    domains: unique([...pack.domains, ...signals.domainTags].filter(Boolean)),
    subdomains: unique([...pack.subdomains, ...signals.subdomains]),
    surfaces: unique([...pack.surfaces, ...signals.surfaces]),
    trustProfile: variant.trustProfile,
    toneProfile: variant.toneProfile,
    productTone: signals.productTone,
    theme: variant.theme,
    colorFamily: selectedColorFamily.id,
    colorFamilyTokens: selectedColorFamily.tokens,
    colorFamilies: unique([selectedColorFamily.id, ...variant.colorFamilies]),
    spacing: variationPreset.spacingPreset,
    typography: variant.typography,
    radius: variant.radius,
    radiusProfile: variationPreset.radiusPreset,
    motionPreset: variationPreset.motionPreset,
    densityProfile: variationPreset.spacingPreset,
    contrastProfile: variant.contrastProfile,
    variationPreset,
    targetUsers: variant.targetUsers,
    tokenHints: unique([
      ...variant.tokenHints,
      `color-family:${selectedColorFamily.id}`,
      `tone:${toneSignature(signals.productTone)}`,
      `variation:${variationPreset.id}`,
      `contrast:${variant.contrastProfile}`,
    ]),
    componentHints: variant.componentHints,
    layoutHints: variant.layoutHints,
    forbiddenPatterns: unique([...pack.forbiddenPatterns, ...variant.forbiddenPatterns]),
    requiredFiles,
    sourceFiles,
    variationSeed,
    antiRepeatGroup: `${variant.packId}:${variant.variantId}:${selectedColorFamily.id}:${variationPreset.id}:${pack.antiRepeatGroup}`,
    fallbackVisualSelection: false,
    pack,
    variant,
    score: candidate.score,
    audit,
    signals,
  };
}

function fallbackVisualSelection(
  input: ResolveVisualSelectionInput,
  signals: VisualSelectionSignals,
  variationSeed: string,
  pipelineStages: VisualSelectionAudit['pipelineStages'] = [],
): VisualSelection {
  const fallbackColorTokens = defaultColorTokens('neutral');
  const fallbackVariationPreset: VariationPreset = {
    id: 'fallback-comfortable',
    visualPackVariant: 'generated-theme-fallback',
    colorFamilyVariant: 'neutral',
    spacingPreset: 'comfortable',
    radiusPreset: 'soft',
    elevationPreset: 'subtle',
    motionPreset: 'gentle',
    blockEmphasisPreset: 'content-first',
  };
  return {
    selectedPackId: 'hardcoded-fallback',
    selectedVariantId: 'generated-theme-fallback',
    selectedThemeFile: undefined,
    purpose: 'Fallback generated visual selection when no file-backed visual pack is available.',
    whenToUse: ['Only when the file-backed visual bank cannot resolve a compatible pack.'],
    requiredComponents: [],
    allowedSurfaces: unique([...(SURFACE_BY_SKELETON[input.skeletonId] ?? []), ...signals.surfaces]),
    linkedStyleFiles: [],
    linkedComponentFiles: [],
    layoutPresetFiles: [],
    motionPresetFiles: [],
    assetReferenceFiles: [],
    materialFiles: [],
    compatibleSkeletons: [input.skeletonId],
    domains: unique([...signals.domainTags, input.skeletonId].filter(Boolean)),
    subdomains: signals.subdomains,
    surfaces: unique([...(SURFACE_BY_SKELETON[input.skeletonId] ?? []), ...signals.surfaces]),
    trustProfile: 'fallback-trust',
    toneProfile: signals.toneProfiles[0] ?? 'corporate',
    productTone: signals.productTone,
    theme: 'generated',
    colorFamily: 'neutral',
    colorFamilyTokens: fallbackColorTokens,
    colorFamilies: ['neutral'],
    spacing: 'comfortable',
    typography: 'sans-technical',
    radius: 'soft',
    radiusProfile: 'soft',
    motionPreset: 'gentle',
    densityProfile: 'comfortable',
    contrastProfile: 'medium',
    variationPreset: fallbackVariationPreset,
    targetUsers: 'generic users',
    tokenHints: ['generated-theme-fallback'],
    componentHints: [],
    layoutHints: [],
    forbiddenPatterns: ['generic blank Tailwind fallback'],
    requiredFiles: [],
    sourceFiles: [],
    variationSeed,
    antiRepeatGroup: `fallback:${input.skeletonId}:generated`,
    fallbackVisualSelection: true,
    pack: null,
    variant: null,
    score: 0,
    audit: {
      pipelineStages,
      bestScore: 0,
      bestRelevanceScore: 0,
      relevanceWindow: 0,
      adaptiveWindow: 0,
      minimumRelevanceFloor: 0,
      desiredPoolSize: 1,
      maxPoolSize: 1,
      viableByRelevanceCount: 0,
      viableByRelevance: [],
      viableCandidatesCount: 0,
      viableCandidates: [],
      candidates: [],
      selectedBySeed: false,
      selectedByStableIndex: false,
      selectedAfterDiversity: false,
      selectedByExactMatch: false,
      selectedVariantId: 'generated-theme-fallback',
      fallbackVisualSelection: true,
    },
    signals,
  };
}

function diversityScoreForCandidate(
  variant: NormalizedVisualVariant,
  signals: VisualSelectionSignals,
  variationSeed: string,
  recentSelections: RecentVisualSelection[],
): { score: number; bonus: number; penalty: number; reasons: string[] } {
  let bonus = 0;
  let penalty = 0;
  const reasons: string[] = [];
  const addBonus = (points: number, reason: string) => {
    bonus += points;
    reasons.push(`${reason}:+${points}`);
  };
  const addPenalty = (points: number, reason: string) => {
    penalty += points;
    reasons.push(`${reason}:-${points}`);
  };

  const seedOffset = antiRepeatBonus(variant.antiRepeatGroup, variationSeed);
  addBonus(seedOffset, 'seed-offset');
  if (isSemanticNeighborVariant(variant.variantId, signals)) addBonus(8, 'fresh-semantic-neighbor');

  for (const recent of recentSelections) {
    const sameSkeleton = !recent.skeletonId || recent.skeletonId === variant.skeleton;
    const sameDomain =
      !recent.domain ||
      signals.domainTags.includes(recent.domain);
    const sameSemantic =
      !recent.semanticDomainId ||
      recent.semanticDomainId === signals.semanticDomainId ||
      signals.domainTags.includes(recent.semanticDomainId);
    if (!sameSkeleton || (!sameDomain && !sameSemantic)) continue;
    const repeatMultiplier = signals.allowToneRepeat ? 0.25 : 1;
    if (recent.antiRepeatGroup && recent.antiRepeatGroup.includes(`${variant.packId}:${variant.variantId}`)) {
      addPenalty(Math.round(18 * repeatMultiplier), 'recent-visual-combination');
    }
    if (recent.antiRepeatGroup && recent.antiRepeatGroup === variant.antiRepeatGroup) addPenalty(Math.round(16 * repeatMultiplier), 'recent-anti-repeat-group');
    if (recent.selectedVariantId && recent.selectedVariantId === variant.variantId) addPenalty(Math.round(12 * repeatMultiplier), 'recent-same-variant');
    if (recent.colorFamily && recent.colorFamily === variant.colorFamily) addPenalty(Math.round(6 * repeatMultiplier), 'recent-same-color-family');
    if (recent.productToneSignature && recent.productToneSignature === toneSignature(signals.productTone)) {
      addPenalty(Math.round(4 * repeatMultiplier), 'recent-same-product-tone');
    }
  }

  return { score: bonus - penalty, bonus, penalty, reasons };
}

function withDiversityScore(
  candidate: VisualCandidate,
  signals: VisualSelectionSignals,
  variationSeed: string,
  recentSelections: RecentVisualSelection[],
): VisualCandidate {
  const diversity = diversityScoreForCandidate(candidate.variant, signals, variationSeed, recentSelections);
  return {
    ...candidate,
    diversityScore: diversity.score,
    score: candidate.relevanceScore + diversity.score,
    diversityReasons: diversity.reasons,
    antiRepeatPenalty: diversity.penalty,
    antiRepeatBonus: diversity.bonus,
  };
}

function relevanceWindowFor(signals: VisualSelectionSignals): number {
  return isStrongSelectionSignals(signals) ? 12 : 10;
}

function minimumRelevanceFloorFor(best: VisualCandidate, signals: VisualSelectionSignals): number {
  const absoluteFloor = isStrongSelectionSignals(signals) ? 126 : 118;
  return Math.max(absoluteFloor, best.relevanceScore - 32);
}

function expandViablePool(input: {
  allCandidates: VisualCandidate[];
  viable: VisualCandidate[];
  bestRelevanceScore: number;
  relevanceWindow: number;
  minimumRelevanceFloor: number;
  signals: VisualSelectionSignals;
}): VisualCandidate[] {
  const desiredPoolSize = isStrongSelectionSignals(input.signals) ? DESIRED_STRONG_POOL_SIZE : 1;
  if (input.viable.length >= desiredPoolSize) return input.viable;

  const safeWindow = Math.max(input.relevanceWindow, 16);
  const expanded = input.allCandidates.filter(candidate =>
    candidate.relevanceScore >= input.bestRelevanceScore - safeWindow &&
    candidate.relevanceScore >= input.minimumRelevanceFloor &&
    candidateHasRequiredMeaning(candidate, input.signals)
  );
  let viable = uniqueCandidates([...input.viable, ...expanded]);
  if (viable.length >= desiredPoolSize) return viable;

  const neighborIds = semanticNeighborIdsForSignals(input.signals);
  const semanticNeighbors = input.allCandidates.filter(candidate =>
    neighborIds.includes(candidate.variant.variantId) &&
    candidate.relevanceScore >= input.minimumRelevanceFloor - 10 &&
    candidateHasRequiredMeaning(candidate, input.signals)
  );
  viable = uniqueCandidates([...viable, ...semanticNeighbors]);
  return viable;
}

function applyPreferredVariantFloor(
  candidates: VisualCandidate[],
  bestRelevanceScore: number,
  signals: VisualSelectionSignals,
): void {
  if (signals.preferredVariants.length === 0) return;
  const floor = bestRelevanceScore - 24;
  for (const candidate of candidates) {
    if (!signals.preferredVariants.includes(candidate.variant.variantId)) continue;
    if (!intersects(candidate.pack.surfaces, signals.surfaces)) continue;
    if (candidate.relevanceScore >= floor) continue;
    candidate.relevanceReasons.push(`preferred-variant-floor:${candidate.relevanceScore}->${floor}`);
    candidate.relevanceScore = floor;
    candidate.score = floor;
  }
}

function candidateHasRequiredMeaning(candidate: VisualCandidate, signals: VisualSelectionSignals): boolean {
  if (!intersects(candidate.pack.surfaces, signals.surfaces)) return false;
  if (candidate.exactMatch || candidate.semanticNeighbor) return true;
  if (intersects(candidate.pack.domains, signals.domainTags)) return true;
  if (intersects(candidate.variant.domains, signals.domainTags)) return true;
  if (intersects(candidate.pack.subdomains, signals.subdomains)) return true;
  if (intersects(candidate.variant.subdomains, signals.subdomains)) return true;
  return !isStrongSelectionSignals(signals);
}

function isStrongSelectionSignals(signals: VisualSelectionSignals): boolean {
  return Boolean(
    signals.semanticDomainId ||
    signals.preferredVariants.length > 0 ||
    signals.toneProfiles.length > 0 ||
    signals.subdomains.length > 0,
  );
}

function isSemanticNeighborVariant(variantId: string, signals: VisualSelectionSignals): boolean {
  return semanticNeighborIdsForSignals(signals).includes(variantId);
}

function semanticNeighborIdsForSignals(signals: VisualSelectionSignals): string[] {
  if (signals.semanticDomainId === 'fintech') {
    return ['fintech-corporate', 'premium-dark', 'minimal-brutal', 'calm'];
  }
  if (signals.semanticDomainId === 'medicine' || signals.domainTags.includes('health')) {
    return ['clinical', 'calm', 'premium-dark', 'mobile-soft'];
  }
  if (signals.semanticDomainId === 'wellness') {
    return ['mobile-soft', 'calm', 'playful', 'creator-social'];
  }
  if (signals.semanticDomainId === 'social') {
    return ['creator-social', 'playful', 'mobile-soft', 'calm', 'premium-dark'];
  }
  const seedVariants = unique([
    ...signals.preferredVariants,
    ...signals.toneProfiles,
  ]);
  const directToneToVariant: Record<string, string[]> = {
    corporate: ['fintech-corporate', 'premium-dark', 'minimal-brutal', 'calm'],
    premium: ['premium-dark', 'fintech-corporate', 'minimal-brutal', 'clinical'],
    clinical: ['clinical', 'calm', 'premium-dark', 'mobile-soft'],
    calm: ['calm', 'mobile-soft', 'clinical', 'premium-dark'],
    soft: ['mobile-soft', 'calm', 'playful', 'creator-social'],
    creator: ['creator-social', 'playful', 'mobile-soft', 'calm'],
    social: ['creator-social', 'playful', 'mobile-soft', 'calm'],
    playful: ['playful', 'creator-social', 'mobile-soft', 'calm'],
    minimal: ['minimal-brutal', 'premium-dark', 'fintech-corporate', 'calm'],
  };
  const ids = new Set<string>();
  for (const seed of seedVariants) {
    ids.add(seed);
    for (const neighbor of SEMANTIC_NEIGHBOR_VARIANTS[seed] ?? []) ids.add(neighbor);
    for (const neighbor of directToneToVariant[seed] ?? []) ids.add(neighbor);
  }
  return Array.from(ids);
}

function compareCandidatesByRelevance(a: VisualCandidate, b: VisualCandidate): number {
  return b.relevanceScore - a.relevanceScore ||
    a.pack.packId.localeCompare(b.pack.packId) ||
    a.variant.variantId.localeCompare(b.variant.variantId);
}

function compareCandidatesByFinalScore(a: VisualCandidate, b: VisualCandidate): number {
  return b.score - a.score ||
    b.relevanceScore - a.relevanceScore ||
    a.pack.packId.localeCompare(b.pack.packId) ||
    a.variant.variantId.localeCompare(b.variant.variantId);
}

function uniqueCandidates(candidates: VisualCandidate[]): VisualCandidate[] {
  const seen = new Set<string>();
  const out: VisualCandidate[] = [];
  for (const candidate of candidates) {
    const key = `${candidate.pack.packId}:${candidate.variant.variantId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
}

function selectionAudit(input: {
  candidates: VisualCandidate[];
  viableByRelevance: VisualCandidate[];
  viableCandidates: VisualCandidate[];
  selected: VisualCandidate;
  selectedIndex: number;
  bestRelevanceScore: number;
  relevanceWindow: number;
  minimumRelevanceFloor: number;
  pipelineStages: VisualSelectionAudit['pipelineStages'];
}): VisualSelectionAudit {
  const relevanceSelected = input.viableByRelevance.find(candidate =>
    candidate.pack.packId === input.selected.pack.packId &&
    candidate.variant.variantId === input.selected.variant.variantId
  );
  return {
    pipelineStages: input.pipelineStages,
    bestScore: input.candidates[0]?.score ?? 0,
    bestRelevanceScore: input.bestRelevanceScore,
    relevanceWindow: input.relevanceWindow,
    adaptiveWindow: input.relevanceWindow,
    minimumRelevanceFloor: input.minimumRelevanceFloor,
    desiredPoolSize: DESIRED_STRONG_POOL_SIZE,
    maxPoolSize: MAX_STRONG_POOL_SIZE,
    viableByRelevanceCount: input.viableByRelevance.length,
    viableByRelevance: input.viableByRelevance.map(candidateAudit),
    viableCandidatesCount: input.viableCandidates.length,
    viableCandidates: input.viableCandidates.map(candidateAudit),
    candidates: input.candidates.slice(0, 12).map(candidateAudit),
    selectedBySeed: input.viableCandidates.length > 1 && input.selectedIndex > 0,
    selectedByStableIndex: input.viableCandidates.length > 1,
    selectedAfterDiversity: Boolean(relevanceSelected && input.selected.score !== relevanceSelected.score),
    selectedByExactMatch: input.selected.exactMatch,
    selectedVariantId: input.selected.variant.variantId,
    fallbackVisualSelection: false,
  };
}

function candidateAudit(candidate: VisualCandidate): VisualCandidateAudit {
  return {
    packId: candidate.pack.packId,
    variantId: candidate.variant.variantId,
    skeletonFit: candidate.skeletonFit,
    domainFit: candidate.domainFit,
    toneFit: candidate.toneFit,
    surfaceFit: candidate.surfaceFit,
    relevanceScore: candidate.relevanceScore,
    diversityScore: candidate.diversityScore,
    finalScore: candidate.score,
    antiRepeatPenalty: candidate.antiRepeatPenalty,
    antiRepeatBonus: candidate.antiRepeatBonus,
    semanticNeighbor: candidate.semanticNeighbor,
    exactMatch: candidate.exactMatch,
    reasons: [...candidate.relevanceReasons, ...candidate.diversityReasons],
  };
}

function inferProductDomain(brief: string, skeletonId: SkeletonId): string {
  const match = PRODUCT_DOMAIN_KEYWORDS.find(item => item.rx.test(brief));
  return match?.id ?? skeletonId;
}

function inferSemanticDomainId(brief: string, semanticDomains: SemanticDomainManifestSchema[]): string | null {
  const keyword = SEMANTIC_KEYWORDS.find(item => item.rx.test(brief));
  if (keyword) return normalizeSemanticDomainId(keyword.id);
  const lower = brief.toLowerCase();
  for (const domain of semanticDomains) {
    const haystack = [
      domain.id,
      domain.name,
      ...(domain.entities ?? []),
      ...(domain.typicalFlows ?? []),
      ...(domain.uiPatterns ?? []),
    ].filter(Boolean).join(' ').toLowerCase();
    if (haystack && lower.split(/\W+/).some(word => word.length > 4 && haystack.includes(word))) {
      return normalizeSemanticDomainId(domain.id);
    }
  }
  return null;
}

function surfaceHintsFromBrief(brief: string): string[] {
  const hints: string[] = [];
  if (/\b(checkout|cart|product)\b/i.test(brief)) hints.push('checkout', 'cart', 'product-detail');
  if (/\b(dashboard|metric|analytics|table)\b/i.test(brief)) hints.push('dashboard', 'metrics', 'data-table');
  if (/\b(feed|post|profile|notification)\b/i.test(brief)) hints.push('feed', 'profile', 'notifications');
  if (/\b(landing|hero|pricing|waitlist)\b/i.test(brief)) hints.push('hero', 'pricing', 'cta');
  if (/\b(kanban|task|workspace|command)\b/i.test(brief)) hints.push('kanban', 'workspace', 'command-palette');
  return hints;
}

function subdomainsFromBrief(brief: string): string[] {
  const hints: string[] = [];
  if (/\b(clinic|patient|doctor|care|medical|health)\b/i.test(brief)) hints.push('clinical', 'healthcare', 'clinic', 'patient-care');
  if (/\b(women|woman|fertility|cycle|period|pregnancy|maternal)\b/i.test(brief)) hints.push('women-health');
  if (/\b(nutrition|supplement|meal|diet|protein|vitamin)\b/i.test(brief)) hints.push('supplements-nutrition', 'nutrition');
  if (/\b(mental|therapy|mood|anxiety|mindful|meditation)\b/i.test(brief)) hints.push('mental-health');
  if (/\b(fitness|habit|workout|training|streak)\b/i.test(brief)) hints.push('habit-fitness', 'habit-tracking');
  if (/\b(bank|wallet|payment|budget|transaction|invoice)\b/i.test(brief)) hints.push('finance-ops', 'payments', 'wallet');
  if (/\b(creator|content|campaign|social)\b/i.test(brief)) hints.push('creator-network', 'creator');
  if (/\b(task|kanban|note|planner|calendar)\b/i.test(brief)) hints.push('task-management', 'kanban', 'notes');
  if (/\b(shop|store|catalog|checkout)\b/i.test(brief)) hints.push('catalog', 'checkout', 'storefront');
  return hints;
}

function toneHintsFromBrief(brief: string): string[] {
  const hints: string[] = [];
  if (/\b(clinical|medical|clinic|health|trust)\b/i.test(brief)) hints.push('clinical', 'trustworthy', 'calm');
  if (/\b(finance|bank|corporate|enterprise|compliance)\b/i.test(brief)) hints.push('corporate', 'premium');
  if (/\b(premium|luxury|elite|dark)\b/i.test(brief)) hints.push('premium');
  if (/\b(playful|fun|kids|game)\b/i.test(brief)) hints.push('playful');
  if (/\b(calm|soft|wellness|zen|mindful)\b/i.test(brief)) hints.push('calm', 'soft');
  if (/\b(minimal|brutal|sharp|plain)\b/i.test(brief)) hints.push('minimal');
  if (/\b(creator|social|community)\b/i.test(brief)) hints.push('creator', 'social');
  return hints;
}

function assetSourceFiles(theme: string, spacing: string, colorFamily?: string): string[] {
  const colorPath = `prototype-bank/design-packs/assets/color-ramps/${theme}.json`;
  const familyPath = colorFamily ? `prototype-bank/design-packs/assets/color-ramps/${colorFamily}.json` : '';
  const spacingPath = `prototype-bank/design-packs/assets/spacing/${spacing}.json`;
  return [
    COLOR_RAMP_PATHS.has(colorPath) ? colorPath : '',
    familyPath && COLOR_RAMP_PATHS.has(familyPath) ? familyPath : '',
    SPACING_PATHS.has(spacingPath) ? spacingPath : '',
    'prototype-bank/design-packs/assets/typography/presets.json',
    'prototype-bank/design-packs/assets/motion/presets.json',
  ].filter(Boolean);
}

function componentHintsFromRaw(raw: VisualVariantSchema): string[] {
  const hints: string[] = [];
  const componentSet = raw.componentSet;
  if (componentSet && typeof componentSet === 'object') {
    hints.push(...Object.entries(componentSet).map(([key, value]) => `${key}:${value}`));
  }
  return hints;
}

function layoutHintsFromRaw(raw: VisualVariantSchema): string[] {
  const hints: string[] = [];
  const knownKeys = [
    'layout',
    'heroStyle',
    'featureStyle',
    'ctaStyle',
    'feedStyle',
    'profileStyle',
    'messagingStyle',
    'communityStyle',
    'productGridStyle',
    'cartStyle',
    'checkoutStyle',
    'productDetailStyle',
  ];
  for (const key of knownKeys) {
    const value = raw[key];
    if (typeof value === 'string' && value.trim()) hints.push(`${key}:${value.trim()}`);
  }
  return hints;
}

function subdomainsFromVariantText(text: string): string[] {
  const lower = text.toLowerCase();
  const hints: string[] = [];
  if (/(clinical|clinic|medical|patient|doctor|health)/.test(lower)) hints.push('clinical', 'healthcare');
  if (/(wellness|self-care|sage)/.test(lower)) hints.push('wellness');
  if (/(habit|fitness|workout|training)/.test(lower)) hints.push('habit-fitness');
  if (/(women|woman|fertility|cycle|pregnancy|rose)/.test(lower)) hints.push('women-health');
  if (/(nutrition|supplement|meal|amber)/.test(lower)) hints.push('supplements-nutrition', 'nutrition');
  if (/(mental|therapy|mood|lavender|calm)/.test(lower)) hints.push('mental-health');
  if (/(finance|fintech|bank|wallet|payment)/.test(lower)) hints.push('finance-ops', 'payments');
  if (/(creator|social|community|feed)/.test(lower)) hints.push('creator-network', 'community');
  return hints;
}

function colorFamiliesForDomains(domains: string[], subdomains: string[] = []): string[] {
  const families = new Set<string>();
  for (const domain of domains) {
    const normalized = normalizeSemanticDomainId(domain) ?? domain;
    for (const family of DOMAIN_COLOR_FAMILY_REGISTRY[domain] ?? []) families.add(family);
    for (const family of DOMAIN_COLOR_FAMILY_REGISTRY[normalized] ?? []) families.add(family);
    for (const alias of domainAliases(domain)) {
      for (const family of DOMAIN_COLOR_FAMILY_REGISTRY[alias] ?? []) families.add(family);
    }
  }
  const subdomainText = subdomains.join(' ').toLowerCase();
  if (/clinical|clinic|patient|care/.test(subdomainText)) {
    families.add('clinical-teal');
    families.add('medical-navy-teal');
  }
  if (/wellness|self-care/.test(subdomainText)) families.add('wellness-sage');
  if (/women|fertility|cycle|pregnancy/.test(subdomainText)) families.add('soft-womens-health');
  if (/nutrition|supplement|meal|diet/.test(subdomainText)) families.add('nutrition-amber-green');
  if (/mental|therapy|mood|calm/.test(subdomainText)) families.add('calm-lavender');
  return Array.from(families);
}

function preferredColorFamilyForSignals(signals: VisualSelectionSignals): string | null {
  const explicit = (signals.selectedSubdomain || '').toLowerCase();
  if (/women|fertility|cycle|pregnancy/.test(explicit)) return 'soft-womens-health';
  if (/nutrition|supplement|meal|diet/.test(explicit)) return 'nutrition-amber-green';
  if (/mental|therapy|mood/.test(explicit)) return 'calm-lavender';
  if (explicit) return null;
  const text = signals.subdomains.join(' ').toLowerCase();
  if (/women|fertility|cycle|pregnancy/.test(text)) return 'soft-womens-health';
  if (/nutrition|supplement|meal|diet/.test(text)) return 'nutrition-amber-green';
  if (/mental|therapy|mood/.test(text)) return 'calm-lavender';
  return null;
}

function domainAliases(value: string | null | undefined): string[] {
  switch (value) {
    case 'medicine': return ['health', 'medical', 'clinical', 'wellness'];
    case 'health': return ['medicine', 'medical', 'clinical', 'wellness'];
    case 'mobile-app': return ['consumer', 'habit', 'lifestyle'];
    case 'saas-dashboard': return ['saas', 'b2b', 'admin', 'analytics', 'operations'];
    case 'productivity-tool': return ['productivity', 'workspace', 'tasks', 'notes'];
    case 'social-community': return ['social', 'community', 'creator', 'feed'];
    case 'landing-page': return ['marketing', 'launch', 'conversion'];
    case 'ecommerce': return ['commerce', 'retail', 'storefront', 'marketplace'];
    case 'wellness': return ['health', 'habit', 'self-care'];
    case 'fintech': return ['finance', 'banking', 'payments'];
    default: return [];
  }
}

function normalizeSemanticDomainId(value: string | null | undefined): string | null {
  if (!value) return null;
  const id = value.trim().toLowerCase();
  if (!id) return null;
  if (id === 'health' || id === 'medical' || id === 'healthcare') return 'medicine';
  if (id === 'commerce') return 'ecommerce';
  if (id === 'ai' || id === 'ai-tools') return 'ai-tools';
  return id;
}

function inferDomainsForColorFamily(familyId: string): string[] {
  const text = familyId.toLowerCase();
  const domains: string[] = [];
  if (/(clinical|medical|wellness|women|nutrition|lavender|sage|health)/.test(text)) domains.push('health', 'medicine', 'wellness');
  if (/(fintech|indigo|navy)/.test(text)) domains.push('fintech');
  if (/(gaming|neon)/.test(text)) domains.push('gaming');
  if (/(playful|coral|cool-blue)/.test(text)) domains.push('social', 'ecommerce');
  if (/(neutral|cool-blue)/.test(text)) domains.push('productivity', 'ai-tools');
  return domains;
}

function defaultLayoutPatternsForSkeleton(skeleton: SkeletonId): string[] {
  switch (skeleton) {
    case 'mobile-app': return ['bottom-tabs', 'card-feed', 'list-detail', 'onboarding-flow', 'bottom-sheet', 'profile-stack'];
    case 'saas-dashboard': return ['sidebar-shell', 'kpi-grid', 'data-table', 'settings-tabs', 'operator-dashboard'];
    case 'landing-page': return ['top-nav', 'hero-section', 'bento-grid', 'pricing-grid', 'faq-stack', 'landing-scroll'];
    case 'social-community': return ['bottom-tabs', 'social-feed', 'story-rail', 'profile-stack', 'comment-thread', 'composer-flow'];
    case 'productivity-tool': return ['sidebar-workspace', 'kanban-board', 'list-detail', 'split-pane', 'command-palette', 'detail-sheet'];
    case 'ecommerce': return ['product-grid', 'product-detail', 'checkout-flow', 'bottom-tabs', 'cart-stack', 'wishlist-list'];
    case 'b2b-operations-workspace': return ['sidebar-shell', 'records-table', 'record-detail', 'kpi-grid', 'settings-tabs'];
    case 'marketplace-platform': return ['product-grid', 'product-detail', 'checkout-flow', 'seller-dashboard', 'cart-stack'];
    case 'creator-editor-workspace': return ['sidebar-workspace', 'canvas-editor', 'properties-panel', 'asset-library', 'project-grid'];
    case 'dating-matching-app': return ['bottom-tabs', 'swipe-deck', 'match-list', 'chat-thread', 'profile-stack'];
    case 'gaming-casino-app': return ['bottom-tabs', 'game-lobby-grid', 'game-detail', 'promotions-list', 'account-stack'];
    case 'game-interactive-app': return ['bottom-tabs', 'level-grid', 'game-canvas', 'leaderboard-list', 'profile-stack'];
    case 'booking-service-app': return ['bottom-tabs', 'service-list', 'booking-wizard', 'my-bookings-list', 'profile-stack'];
    case 'content-learning-app': return ['bottom-tabs', 'course-grid', 'course-detail', 'lesson-player', 'progress-stack'];
  }
}

function defaultComponentFamiliesForSkeleton(skeleton: SkeletonId): string[] {
  switch (skeleton) {
    case 'mobile-app': return ['mobile-nav', 'feed-item', 'onboarding-step', 'profile-card', 'bottom-sheet', 'card', 'list-item'];
    case 'saas-dashboard': return ['sidebar-nav', 'dashboard-header', 'stat-card', 'metric-card', 'data-table', 'tabs'];
    case 'landing-page': return ['nav', 'hero', 'bento', 'pricing-card', 'faq', 'cta'];
    case 'social-community': return ['mobile-nav', 'post-card', 'comment-item', 'notification-item', 'user-avatar', 'feed-card'];
    case 'productivity-tool': return ['sidebar-nav', 'top-bar', 'kanban-card', 'list-item', 'tabs', 'command-palette', 'sheet'];
    case 'ecommerce': return ['product-card', 'product-image', 'image-gallery', 'rating-stars', 'review-item', 'filters', 'bottom-tabs'];
    case 'b2b-operations-workspace': return ['sidebar-nav', 'dashboard-header', 'stat-card', 'data-table', 'list-item', 'tabs'];
    case 'marketplace-platform': return ['product-card', 'product-image', 'rating-stars', 'review-item', 'filters', 'cart-item'];
    case 'creator-editor-workspace': return ['sidebar-nav', 'toolbar', 'canvas-panel', 'property-panel', 'asset-card', 'tabs'];
    case 'dating-matching-app': return ['mobile-nav', 'profile-card', 'swipe-card', 'match-item', 'chat-bubble', 'avatar'];
    case 'gaming-casino-app': return ['mobile-nav', 'game-card', 'promotion-banner', 'category-chip', 'account-summary'];
    case 'game-interactive-app': return ['mobile-nav', 'level-card', 'game-canvas', 'leaderboard-item', 'achievement-badge'];
    case 'booking-service-app': return ['mobile-nav', 'service-card', 'time-slot-picker', 'booking-item', 'profile-card'];
    case 'content-learning-app': return ['mobile-nav', 'course-card', 'lesson-item', 'progress-ring', 'video-player', 'tabs'];
  }
}

function defaultSubdomainsForSkeleton(skeleton: SkeletonId): string[] {
  switch (skeleton) {
    case 'mobile-app': return ['consumer-mobile', 'habit-tracking', 'wellness', 'women-health', 'nutrition'];
    case 'saas-dashboard': return ['analytics', 'operations'];
    case 'landing-page': return ['launch', 'conversion'];
    case 'social-community': return ['feed', 'community'];
    case 'productivity-tool': return ['task-management', 'workspace'];
    case 'ecommerce': return ['catalog', 'checkout'];
    case 'b2b-operations-workspace': return ['operations', 'analytics', 'workspace'];
    case 'marketplace-platform': return ['catalog', 'checkout', 'marketplace'];
    case 'creator-editor-workspace': return ['design', 'creator', 'workspace'];
    case 'dating-matching-app': return ['dating', 'social', 'consumer-mobile'];
    case 'gaming-casino-app': return ['gaming', 'entertainment'];
    case 'game-interactive-app': return ['gaming', 'entertainment'];
    case 'booking-service-app': return ['booking', 'services', 'wellness'];
    case 'content-learning-app': return ['education', 'learning'];
  }
}

function defaultTrustProfileForSkeleton(skeleton: SkeletonId): string {
  switch (skeleton) {
    case 'mobile-app': return 'consumer-trust';
    case 'saas-dashboard': return 'enterprise-trust';
    case 'landing-page': return 'market-trust';
    case 'social-community': return 'community-trust';
    case 'productivity-tool': return 'workspace-trust';
    case 'ecommerce': return 'commerce-trust';
    case 'b2b-operations-workspace': return 'enterprise-trust';
    case 'marketplace-platform': return 'commerce-trust';
    case 'creator-editor-workspace': return 'workspace-trust';
    case 'dating-matching-app': return 'consumer-trust';
    case 'gaming-casino-app': return 'consumer-trust';
    case 'game-interactive-app': return 'consumer-trust';
    case 'booking-service-app': return 'consumer-trust';
    case 'content-learning-app': return 'consumer-trust';
  }
}

function inferColorFamily(theme: string, variantId: string, targetUsers: string): string {
  if (theme.includes('clinical')) return 'clinical-teal';
  if (theme.includes('fintech') || variantId.includes('fintech')) return 'fintech-indigo';
  if (theme.includes('soft')) return 'soft-womens-health';
  if (theme.includes('playful')) return 'playful-coral';
  if (theme.includes('cool') || targetUsers.includes('creator')) return 'cool-blue';
  if (theme.includes('luxury')) return 'luxury-dark-gold';
  if (theme.includes('gaming')) return 'gaming-neon';
  return 'neutral';
}

function inferTrustProfile(theme: string, variantId: string, targetUsers: string): string {
  const text = `${theme} ${variantId} ${targetUsers}`.toLowerCase();
  if (/(clinical|medical|health|patient|care)/.test(text)) return 'clinical-trust';
  if (/(fintech|bank|finance|payment|compliance)/.test(text)) return 'financial-trust';
  if (/(creator|social|community)/.test(text)) return 'creator-trust';
  if (/(premium|enterprise|corporate)/.test(text)) return 'enterprise-trust';
  if (/(wellness|soft|habit)/.test(text)) return 'wellness-trust';
  return 'general-trust';
}

function inferToneProfile(theme: string, variantId: string, targetUsers: string): string {
  const text = `${theme} ${variantId} ${targetUsers}`.toLowerCase();
  if (/clinical|medical|health|patient/.test(text)) return 'clinical';
  if (/fintech|corporate|bank|finance/.test(text)) return 'corporate';
  if (/premium|luxury|dark/.test(text)) return 'premium';
  if (/playful|game|fun/.test(text)) return 'playful';
  if (/creator|social|community/.test(text)) return 'creator';
  if (/brutal|minimal/.test(text)) return 'minimal';
  if (/soft|wellness/.test(text)) return 'soft';
  return 'calm';
}

function inferContrastProfile(theme: string, variantId: string, targetUsers: string): string {
  const text = `${theme} ${variantId} ${targetUsers}`.toLowerCase();
  if (/premium|dark|fintech|bank|brutal|minimal|gaming|neon/.test(text)) return 'high';
  if (/soft|wellness|women|calm|lavender|sage/.test(text)) return 'low';
  return 'medium';
}

function inferDensityProfile(spacing: string, variantId: string): string {
  if (spacing === 'compact' || variantId.includes('corporate') || variantId.includes('minimal')) return 'compact';
  if (spacing === 'spacious' || variantId.includes('playful') || variantId.includes('soft')) return 'spacious';
  return 'comfortable';
}

function inferRadiusProfile(variantId: string): string {
  if (variantId.includes('brutal') || variantId.includes('corporate') || variantId.includes('clinical')) return 'sharp';
  if (variantId.includes('playful') || variantId.includes('soft')) return 'pill';
  return 'soft';
}

function normalizeSourcePath(modulePath: string): string {
  const normalized = modulePath.replace(/\\/g, '/');
  const idx = normalized.indexOf('prototype-bank/');
  return idx >= 0 ? normalized.slice(idx) : normalized.replace(/^\.\.\//, '');
}

function packIdFromPath(path: string): string | null {
  return path.replace(/\\/g, '/').match(/prototype-bank\/design-packs\/domain\/([^/]+)\/manifest\.json$/)?.[1]
    ?? path.replace(/\\/g, '/').match(/prototype-bank\/design-packs\/domain\/([^/]+)\/visual-variants\//)?.[1]
    ?? null;
}

function colorFamilyIdFromPath(path: string): string | null {
  return path.replace(/\\/g, '/').match(/color-ramps\/([^/]+)\.json$/)?.[1] ?? null;
}

function variantIdFromPath(path: string): string | null {
  return path.replace(/\\/g, '/').match(/visual-variants\/([^/]+)\.json$/)?.[1] ?? null;
}

function normalizeSkeletons(value: unknown, fallback: SkeletonId): SkeletonId[] {
  const ids = stringArray(value).map(asSkeletonId).filter((id): id is SkeletonId => Boolean(id));
  return uniqueSkeletons(ids.length > 0 ? ids : [fallback]);
}

function asSkeletonId(value: unknown): SkeletonId | null {
  return typeof value === 'string' && value in SKELETON_REGISTRY ? value as SkeletonId : null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean)));
}

function uniqueSkeletons(values: SkeletonId[]): SkeletonId[] {
  return Array.from(new Set(values));
}

function intersects(a: string[], b: string[]): boolean {
  const set = new Set(a.map(item => item.toLowerCase()));
  return b.some(item => set.has(item.toLowerCase()));
}

function titleFromId(id: string): string {
  return id.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function variantOrder(variants: unknown, variantId: string): number {
  const ordered = stringArray(variants);
  const idx = ordered.indexOf(variantId);
  return idx >= 0 ? idx : Number.MAX_SAFE_INTEGER;
}

function withSelectionSeed(variant: NormalizedVisualVariant, variationSeed: string): NormalizedVisualVariant {
  if (variant.variationSeed === variationSeed) return variant;
  return { ...variant, variationSeed };
}

function deterministicHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function stableIndex(seed: string, length: number): number {
  if (length <= 1) return 0;
  return parseInt(seed.slice(0, 8), 16) % length;
}

function antiRepeatBonus(group: string, seed: string): number {
  return parseInt(deterministicHash(`${group}:${seed}`).slice(0, 2), 16) % 7;
}
