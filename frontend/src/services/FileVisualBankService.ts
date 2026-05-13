/// <reference types="vite/client" />

import {
  SKELETON_REGISTRY,
  type SkeletonId,
} from './SkeletonRegistry';

export type VisualBankScalar = string | number | boolean | null;
export type VisualBankJson = VisualBankScalar | VisualBankJson[] | { [key: string]: VisualBankJson };

export interface VisualPackManifestSchema {
  id: string;
  skeleton: SkeletonId | string;
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
  trustProfile?: string;
  toneProfile?: string;
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
  trustProfile: string;
  toneProfile: string;
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
  sourceFiles: string[];
}

export interface VisualSelectionSignals {
  semanticDomainId: string | null;
  productDomain: string;
  subdomains: string[];
  surfaces: string[];
  toneProfiles: string[];
  preferredVariants: string[];
  recommendedVisualPacks: SkeletonId[];
  recommendedDesign: string | null;
}

export interface VisualSelection {
  selectedPackId: string;
  selectedVariantId: string;
  selectedVariantPath?: string;
  selectedManifestPath?: string;
  compatibleSkeletons: SkeletonId[];
  domains: string[];
  subdomains: string[];
  surfaces: string[];
  trustProfile: string;
  toneProfile: string;
  theme: string;
  colorFamily: string;
  colorFamilies: string[];
  spacing: string;
  typography: string;
  radius: VisualBankJson;
  motionPreset: string;
  densityProfile: string;
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
  recentSelections?: RecentVisualSelection[];
  visualBankOverride?: NormalizedVisualBank;
  visualPacksOverride?: NormalizedVisualPack[];
}

interface VisualCandidate {
  pack: NormalizedVisualPack;
  variant: NormalizedVisualVariant;
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
}

export interface VisualCandidateAudit {
  packId: string;
  variantId: string;
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

const COLOR_RAMP_PATHS = new Set([
  'clinical-teal',
  'cool-blue',
  'fintech-indigo',
  'gaming-neon',
  'luxury-dark-gold',
  'neutral',
  'playful-coral',
  'soft-womens-health',
].map(theme => `prototype-bank/design-packs/assets/color-ramps/${theme}.json`));

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
  'mobile-app': ['mobile', 'bottom-tabs', 'feed', 'detail', 'profile', 'onboarding'],
  'saas-dashboard': ['dashboard', 'sidebar', 'metrics', 'data-table', 'settings', 'workspace'],
  'landing-page': ['marketing', 'hero', 'pricing', 'faq', 'cta', 'top-nav', 'social-proof'],
  'social-community': ['mobile', 'bottom-tabs', 'feed', 'explore', 'notifications', 'profile', 'post-detail'],
  'productivity-tool': ['workspace', 'sidebar', 'kanban', 'list', 'detail-sheet', 'command-palette'],
  ecommerce: ['storefront', 'product-grid', 'product-detail', 'cart', 'checkout', 'account'],
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
  ecommerce: [
    'prototype-bank/design-packs/surfaces/primitives/button.tsx',
    'prototype-bank/design-packs/surfaces/primitives/card.tsx',
    'prototype-bank/design-packs/surfaces/cards/list-item.tsx',
    'prototype-bank/design-packs/surfaces/cards/profile-card.tsx',
  ],
};

const PACK_DOMAIN_ALIASES: Record<SkeletonId, string[]> = {
  'mobile-app': ['consumer', 'wellness', 'health', 'habit', 'lifestyle'],
  'saas-dashboard': ['saas', 'b2b', 'admin', 'analytics', 'fintech', 'medicine', 'ai-tools'],
  'landing-page': ['marketing', 'saas', 'ecommerce', 'creator', 'fintech', 'wellness'],
  'social-community': ['social', 'community', 'creator', 'forum', 'network', 'medicine'],
  'productivity-tool': ['productivity', 'workspace', 'tasks', 'notes', 'ai-tools', 'saas', 'wellness'],
  ecommerce: ['commerce', 'storefront', 'retail', 'creator', 'marketplace'],
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

const DESIRED_STRONG_POOL_SIZE = 2;
const MAX_STRONG_POOL_SIZE = 4;

let cachedBank: NormalizedVisualBank | null = null;

export function loadFileVisualBank(): NormalizedVisualBank {
  if (cachedBank) return cachedBank;

  const semanticDomains = Object.entries(semanticDomainModules)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, domain]) => domain);

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
    sourceFiles: unique([
      ...packs.flatMap(pack => pack.sourceFiles),
      ...Object.keys(semanticDomainModules).map(normalizeSourcePath),
    ]),
  };
  return cachedBank;
}

export function invalidateFileVisualBankCache(): void {
  cachedBank = null;
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

  const candidates = packs
    .filter(pack => pack.compatibleSkeletons.includes(input.skeletonId))
    .filter(pack => intersects(pack.surfaces, signals.surfaces))
    .flatMap(pack => pack.variants.map(variant => scoreCandidate({
      pack,
      variant: withSelectionSeed(variant, variationSeed),
      skeletonId: input.skeletonId,
      signals,
    })))
    .filter(candidate => candidate.relevanceScore > 0)
    .filter(candidate => candidateHasRequiredMeaning(candidate, signals))
    .sort(compareCandidatesByRelevance);

  if (candidates.length === 0) {
    return fallbackVisualSelection(input, signals, variationSeed);
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
    .map(candidate => withDiversityScore(candidate, signals, variationSeed, input.recentSelections ?? []));
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
  });
  return selectionFromCandidate(selected, signals, variationSeed, audit);
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
  const colorFamilies = unique([...stringArray(raw.colorFamilies), 'neutral']);
  const requiredFiles = unique(stringArray(raw.requiredFiles));
  const forbiddenPatterns = unique(stringArray(raw.forbiddenPatterns));
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
    ...assetSourceFiles(theme, spacing),
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
    trustProfile,
    toneProfile,
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
    input.semanticDomainId ??
    input.semanticDomain?.id ??
    inferSemanticDomainId(brief, semanticDomains);
  const semanticDomain = input.semanticDomain ?? semanticDomains.find(domain => domain.id === semanticDomainId) ?? null;
  const bridge = semanticDomain ? bridgeForSemanticDomain(semanticDomain) : bridgeForSemanticDomainId(semanticDomainId);
  const productDomain = inferProductDomain(brief, input.skeletonId);
  const surfaces = unique([
    ...(SURFACE_BY_SKELETON[input.skeletonId] ?? []),
    ...surfaceHintsFromBrief(brief),
    input.surface ?? '',
  ].filter(Boolean));
  const subdomains = unique([
    ...bridge.subdomains,
    ...subdomainsFromBrief(brief),
    input.subdomain ?? '',
  ].filter(Boolean));
  const toneProfiles = unique([
    ...bridge.toneProfiles,
    ...toneHintsFromBrief(brief),
    input.tone ?? '',
  ].filter(Boolean));

  return {
    semanticDomainId: semanticDomainId ?? null,
    productDomain,
    subdomains,
    surfaces,
    toneProfiles,
    preferredVariants: bridge.preferredVariants,
    recommendedVisualPacks: bridge.recommendedVisualPacks,
    recommendedDesign: semanticDomain?.recommendedDesign ?? bridge.recommendedDesign,
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
    subdomains: unique([...byId.subdomains, ...byDesign.subdomains]),
    toneProfiles: unique([...byId.toneProfiles, ...byDesign.toneProfiles]),
    recommendedDesign: domain.recommendedDesign ?? byId.recommendedDesign ?? byDesign.recommendedDesign,
  };
}

function bridgeForSemanticDomainId(id: string | null | undefined): ReturnType<typeof bridgeForRecommendedDesign> {
  switch (id) {
    case 'medicine':
      return {
        recommendedVisualPacks: ['saas-dashboard', 'mobile-app', 'productivity-tool', 'landing-page', 'social-community'],
        preferredVariants: ['clinical', 'calm', 'mobile-soft'],
        subdomains: ['healthcare', 'clinic', 'patient-care', 'care-team', 'support-group'],
        toneProfiles: ['clinical', 'calm', 'trustworthy'],
        recommendedDesign: 'trust-medical',
      };
    case 'wellness':
      return {
        recommendedVisualPacks: ['mobile-app', 'productivity-tool', 'landing-page', 'social-community'],
        preferredVariants: ['mobile-soft', 'calm', 'clinical'],
        subdomains: ['wellness', 'habit-tracking', 'self-care', 'daily-focus'],
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

function scoreCandidate(input: {
  pack: NormalizedVisualPack;
  variant: NormalizedVisualVariant;
  skeletonId: SkeletonId;
  signals: VisualSelectionSignals;
}): VisualCandidate {
  const { pack, variant, skeletonId, signals } = input;
  let relevanceScore = 0;
  const relevanceReasons: string[] = [];
  const addRelevance = (points: number, reason: string) => {
    relevanceScore += points;
    relevanceReasons.push(`${reason}:+${points}`);
  };

  if (pack.compatibleSkeletons.includes(skeletonId)) addRelevance(80, 'skeleton-compatible');
  if (pack.skeleton === skeletonId) addRelevance(20, 'skeleton-exact');
  if (pack.domains.includes(signals.productDomain)) addRelevance(22, 'product-domain');
  if (pack.domains.includes(signals.semanticDomainId ?? '')) addRelevance(18, 'semantic-domain');
  if (signals.recommendedVisualPacks.includes(pack.skeleton)) addRelevance(20, 'semantic-pack-bridge');
  if (intersects(pack.subdomains, signals.subdomains)) addRelevance(14, 'subdomain');
  if (intersects(pack.surfaces, signals.surfaces)) addRelevance(12, 'surface');
  if (signals.productDomain === pack.skeleton) addRelevance(10, 'product-skeleton');

  const semanticNeighbor = isSemanticNeighborVariant(variant.variantId, signals);
  const exactMatch =
    signals.preferredVariants.includes(variant.variantId) ||
    signals.toneProfiles.includes(variant.toneProfile) ||
    signals.toneProfiles.some(tone => variant.variantId.includes(tone));

  if (signals.preferredVariants.includes(variant.variantId)) addRelevance(18, 'preferred-variant');
  if (signals.toneProfiles.includes(variant.toneProfile)) addRelevance(14, 'tone-profile');
  if (signals.toneProfiles.some(tone => variant.variantId.includes(tone))) addRelevance(12, 'tone-in-variant');
  if (signals.toneProfiles.some(tone => variant.targetUsers.toLowerCase().includes(tone))) addRelevance(5, 'tone-in-users');
  if (signals.semanticDomainId && variant.targetUsers.toLowerCase().includes(signals.semanticDomainId)) addRelevance(6, 'semantic-in-users');
  if (semanticNeighbor) addRelevance(12, 'semantic-neighbor');
  relevanceScore += pack.priorityScore;
  if (pack.priorityScore) relevanceReasons.push(`pack-priority:+${pack.priorityScore}`);

  return {
    pack,
    variant,
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
): VisualSelection {
  const pack = candidate.pack;
  const variant = withSelectionSeed(candidate.variant, variationSeed);
  const requiredFiles = unique([
    ...pack.requiredFiles,
    ...variant.requiredFiles,
  ]);
  const sourceFiles = unique([
    pack.manifestPath,
    variant.variantPath,
    ...variant.sourceFiles,
  ]);

  return {
    selectedPackId: pack.packId,
    selectedVariantId: variant.variantId,
    selectedVariantPath: variant.variantPath,
    selectedManifestPath: pack.manifestPath,
    compatibleSkeletons: pack.compatibleSkeletons,
    domains: unique([...pack.domains, signals.semanticDomainId ?? '', signals.productDomain].filter(Boolean)),
    subdomains: unique([...pack.subdomains, ...signals.subdomains]),
    surfaces: unique([...pack.surfaces, ...signals.surfaces]),
    trustProfile: variant.trustProfile,
    toneProfile: variant.toneProfile,
    theme: variant.theme,
    colorFamily: variant.colorFamily,
    colorFamilies: variant.colorFamilies,
    spacing: variant.spacing,
    typography: variant.typography,
    radius: variant.radius,
    motionPreset: variant.motionPreset,
    densityProfile: variant.densityProfile,
    targetUsers: variant.targetUsers,
    tokenHints: variant.tokenHints,
    componentHints: variant.componentHints,
    layoutHints: variant.layoutHints,
    forbiddenPatterns: unique([...pack.forbiddenPatterns, ...variant.forbiddenPatterns]),
    requiredFiles,
    sourceFiles,
    variationSeed,
    antiRepeatGroup: variant.antiRepeatGroup,
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
): VisualSelection {
  return {
    selectedPackId: 'hardcoded-fallback',
    selectedVariantId: 'generated-theme-fallback',
    compatibleSkeletons: [input.skeletonId],
    domains: unique([signals.semanticDomainId ?? '', signals.productDomain, input.skeletonId].filter(Boolean)),
    subdomains: signals.subdomains,
    surfaces: unique([...(SURFACE_BY_SKELETON[input.skeletonId] ?? []), ...signals.surfaces]),
    trustProfile: 'fallback-trust',
    toneProfile: signals.toneProfiles[0] ?? 'corporate',
    theme: 'generated',
    colorFamily: 'generated',
    colorFamilies: ['generated'],
    spacing: 'comfortable',
    typography: 'sans-technical',
    radius: 'soft',
    motionPreset: 'gentle',
    densityProfile: 'comfortable',
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

  const seedOffset = parseInt(deterministicHash(`${variant.antiRepeatGroup}:${variationSeed}`).slice(0, 2), 16) % 7;
  addBonus(seedOffset, 'seed-offset');
  if (isSemanticNeighborVariant(variant.variantId, signals)) addBonus(8, 'fresh-semantic-neighbor');

  for (const recent of recentSelections) {
    const sameSkeleton = !recent.skeletonId || recent.skeletonId === variant.skeleton;
    const sameDomain =
      !recent.domain ||
      recent.domain === signals.productDomain ||
      recent.domain === signals.semanticDomainId;
    const sameSemantic =
      !recent.semanticDomainId ||
      recent.semanticDomainId === signals.semanticDomainId ||
      recent.semanticDomainId === signals.productDomain;
    if (!sameSkeleton || (!sameDomain && !sameSemantic)) continue;
    if (recent.antiRepeatGroup && recent.antiRepeatGroup === variant.antiRepeatGroup) addPenalty(16, 'recent-anti-repeat-group');
    if (recent.selectedVariantId && recent.selectedVariantId === variant.variantId) addPenalty(12, 'recent-same-variant');
    if (recent.colorFamily && recent.colorFamily === variant.colorFamily) addPenalty(6, 'recent-same-color-family');
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
  if (candidate.pack.domains.includes(signals.productDomain)) return true;
  if (signals.semanticDomainId && candidate.pack.domains.includes(signals.semanticDomainId)) return true;
  if (intersects(candidate.pack.subdomains, signals.subdomains)) return true;
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
  if (signals.semanticDomainId === 'medicine') {
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
}): VisualSelectionAudit {
  const relevanceSelected = input.viableByRelevance.find(candidate =>
    candidate.pack.packId === input.selected.pack.packId &&
    candidate.variant.variantId === input.selected.variant.variantId
  );
  return {
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
  if (keyword) return keyword.id;
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
      return domain.id;
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
  if (/\b(clinic|patient|doctor|care|medical|health)\b/i.test(brief)) hints.push('healthcare', 'clinic', 'patient-care');
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

function assetSourceFiles(theme: string, spacing: string): string[] {
  const colorPath = `prototype-bank/design-packs/assets/color-ramps/${theme}.json`;
  const spacingPath = `prototype-bank/design-packs/assets/spacing/${spacing}.json`;
  return [
    COLOR_RAMP_PATHS.has(colorPath) ? colorPath : '',
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

function defaultSubdomainsForSkeleton(skeleton: SkeletonId): string[] {
  switch (skeleton) {
    case 'mobile-app': return ['consumer-mobile', 'habit-tracking'];
    case 'saas-dashboard': return ['analytics', 'operations'];
    case 'landing-page': return ['launch', 'conversion'];
    case 'social-community': return ['feed', 'community'];
    case 'productivity-tool': return ['task-management', 'workspace'];
    case 'ecommerce': return ['catalog', 'checkout'];
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
