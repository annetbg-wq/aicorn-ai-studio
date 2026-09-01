import type { SkeletonId } from './SkeletonRegistry';
import { compileSkeletonContract, listSkeletonContractIds } from './SkeletonContractCompiler';

export type ProductArchetype =
  | 'mobile-consumer'
  | 'super-app'
  | 'multi-domain-consumer'
  | 'single-purpose-tool'
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

const PRODUCT_ARCHETYPES = new Set<ProductArchetype>([
  'mobile-consumer', 'super-app', 'multi-domain-consumer', 'single-purpose-tool',
  'dashboard', 'marketing', 'social', 'productivity', 'commerce', 'marketplace',
  'creator-tool', 'dating', 'gaming', 'interactive-game', 'booking', 'learning',
]);

export interface SkeletonSelectionCompatibilityContract {
  archetypes: ProductArchetype[];
  surfaces: string[];
  capabilities: string[];
  incompatibleArchetypes: ProductArchetype[];
}

export interface IntentCompatibilityProfile {
  signal: string;
  label: string;
  archetypes: ProductArchetype[];
}

export interface SkeletonIntentCompatibilityEvaluation {
  signal: string;
  label: string;
  selectedSkeletonId: SkeletonId;
  selectedScores: number[];
  explicitlyCompatible: boolean;
  explicitlyIncompatible: boolean;
  mismatch: boolean;
  preferredSkeletonId: SkeletonId | null;
}

/**
 * Intent vocabulary is textual interpretation. Skeleton fit itself is never
 * encoded here: it comes from the canonical compiled skeleton contract.
 * Archetype order is preference order when an intent spans multiple product types.
 */
const INTENT_COMPATIBILITY_PROFILES: ReadonlyArray<IntentCompatibilityProfile> = [
  { signal: 'landing-intent', label: 'Landing/marketing', archetypes: ['marketing'] },
  { signal: 'dashboard-intent', label: 'Dashboard/analytics', archetypes: ['dashboard'] },
  { signal: 'marketplace-intent', label: 'Marketplace/ecommerce', archetypes: ['commerce', 'marketplace'] },
  { signal: 'social-intent', label: 'Social/community', archetypes: ['social'] },
  { signal: 'game-intent', label: 'Game/RPG', archetypes: ['interactive-game', 'gaming'] },
];

function parseArchetypes(id: SkeletonId, values: string[], field: string): ProductArchetype[] {
  for (const value of values) {
    if (!PRODUCT_ARCHETYPES.has(value as ProductArchetype)) {
      throw new Error(`${id}: selectionContract.${field} contains unknown archetype: ${value}`);
    }
  }
  return [...values] as ProductArchetype[];
}

/** Compatibility accessor backed only by the compiled runtime contract. */
export function getSkeletonSelectionCompatibility(id: SkeletonId): SkeletonSelectionCompatibilityContract {
  const selection = compileSkeletonContract(id).selection;
  const archetypes = parseArchetypes(id, selection.productTypes, 'productTypes');
  const incompatibleArchetypes = parseArchetypes(id, selection.incompatibleArchetypes, 'incompatibleArchetypes');

  return {
    archetypes,
    surfaces: [...selection.surfaces],
    capabilities: [...selection.capabilities],
    incompatibleArchetypes,
  };
}

export function listSkeletonSelectionCompatibilityIds(): SkeletonId[] {
  return listSkeletonContractIds();
}

export function scoreSkeletonCompatibility(
  id: SkeletonId,
  archetype: ProductArchetype,
): number {
  const contract = getSkeletonSelectionCompatibility(id);
  if (contract.incompatibleArchetypes.includes(archetype)) return -100;
  if (contract.archetypes.includes(archetype)) return 100;
  return 0;
}

export function getIntentCompatibilityProfile(signal: string): IntentCompatibilityProfile | null {
  const profile = INTENT_COMPATIBILITY_PROFILES.find(item => item.signal === signal);
  return profile
    ? { ...profile, archetypes: [...profile.archetypes] }
    : null;
}

/**
 * Picks a compatible skeleton from compiled manifest semantics only. For
 * multi-archetype intents, earlier archetypes win; registry order is the
 * deterministic tie-break.
 */
export function resolvePreferredSkeletonForIntent(
  signal: string,
  candidateIds: SkeletonId[] = listSkeletonSelectionCompatibilityIds(),
): SkeletonId | null {
  const profile = getIntentCompatibilityProfile(signal);
  if (!profile) return null;

  for (const archetype of profile.archetypes) {
    const candidate = candidateIds.find(id => scoreSkeletonCompatibility(id, archetype) === 100);
    if (candidate) return candidate;
  }
  return null;
}

/**
 * Evaluates a selected skeleton against an intent using compiled manifest declarations.
 * A weak universal fallback (typically mobile-app with tag score <2) is also a
 * mismatch when another skeleton explicitly declares compatibility.
 */
export function evaluateSkeletonIntentCompatibility(input: {
  selectedSkeletonId: SkeletonId;
  signal: string;
  weakFallback?: boolean;
  candidateIds?: SkeletonId[];
}): SkeletonIntentCompatibilityEvaluation | null {
  const profile = getIntentCompatibilityProfile(input.signal);
  if (!profile) return null;

  const candidateIds = input.candidateIds ?? listSkeletonSelectionCompatibilityIds();
  const selectedScores = profile.archetypes.map(archetype =>
    scoreSkeletonCompatibility(input.selectedSkeletonId, archetype),
  );
  const explicitlyCompatible = selectedScores.includes(100);
  const explicitlyIncompatible = !explicitlyCompatible && selectedScores.includes(-100);
  const preferredSkeletonId = resolvePreferredSkeletonForIntent(input.signal, candidateIds);
  const mismatch = explicitlyIncompatible || Boolean(
    input.weakFallback
    && !explicitlyCompatible
    && preferredSkeletonId
    && preferredSkeletonId !== input.selectedSkeletonId,
  );

  return {
    signal: input.signal,
    label: profile.label,
    selectedSkeletonId: input.selectedSkeletonId,
    selectedScores,
    explicitlyCompatible,
    explicitlyIncompatible,
    mismatch,
    preferredSkeletonId,
  };
}
