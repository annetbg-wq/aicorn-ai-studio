import { compileSkeletonContract } from './SkeletonContractCompiler';
import type { SkeletonId } from './SkeletonRegistry';

export interface ProductDeltaScope {
  required: string[];
  optional: string[];
  allowed: string[];
}

export interface ProductDeltaFileFilterResult {
  files: Record<string, string>;
  rejected: string[];
}

export interface ProductDeltaSpec {
  path: string;
  purpose: string;
}

export interface ProductDeltaChecklistTargetItem {
  targetFiles: string[];
}

/** Normalize a repository/src-relative path to the path shape used by preview-workspace/src. */
export function normalizeProductDeltaPath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\//, '')
    .replace(/^src\//, '');
}

function unique(paths: readonly string[]): string[] {
  return Array.from(new Set(paths));
}

/**
 * Canonical generation write scope. Product generation may write only manifest-declared
 * required/optional product slots. `editable` is intentionally not used as permission.
 */
export function getProductDeltaScope(skeletonId: SkeletonId): ProductDeltaScope {
  const contract = compileSkeletonContract(skeletonId);
  const required = unique(contract.requiredSlots.map(normalizeProductDeltaPath));
  const optional = unique(contract.optionalSlots.map(normalizeProductDeltaPath));
  return {
    required,
    optional,
    allowed: unique([...required, ...optional]),
  };
}

export function isProductDeltaPath(skeletonId: SkeletonId, path: string): boolean {
  const normalized = normalizeProductDeltaPath(path);
  return getProductDeltaScope(skeletonId).allowed.includes(normalized);
}

/** Hard allow-list for any generated/repair file map before it can reach preview writes. */
export function filterProductDeltaFiles(
  skeletonId: SkeletonId,
  files: Record<string, string>,
): ProductDeltaFileFilterResult {
  const allowed = new Set(getProductDeltaScope(skeletonId).allowed);
  const accepted: Record<string, string> = {};
  const rejected: string[] = [];

  for (const [path, content] of Object.entries(files)) {
    const normalized = normalizeProductDeltaPath(path);
    if (!allowed.has(normalized)) {
      rejected.push(normalized);
      continue;
    }
    accepted[normalized] = content;
  }

  return {
    files: accepted,
    rejected: unique(rejected).sort((a, b) => a.localeCompare(b)),
  };
}

/** Keep an architect/coder target list inside the same canonical product-slot scope. */
export function filterProductDeltaSpecs(
  skeletonId: SkeletonId,
  specs: readonly ProductDeltaSpec[],
): { specs: ProductDeltaSpec[]; rejected: string[] } {
  const allowed = new Set(getProductDeltaScope(skeletonId).allowed);
  const accepted = new Map<string, ProductDeltaSpec>();
  const rejected: string[] = [];

  for (const spec of specs) {
    const normalized = normalizeProductDeltaPath(spec.path);
    if (!allowed.has(normalized)) {
      rejected.push(normalized);
      continue;
    }
    if (!accepted.has(normalized)) {
      accepted.set(normalized, { path: normalized, purpose: spec.purpose });
    }
  }

  return {
    specs: Array.from(accepted.values()),
    rejected: unique(rejected).sort((a, b) => a.localeCompare(b)),
  };
}

/**
 * Bind checklist verification targets to the CURRENT compiled product-delta plan.
 *
 * Product-document packages are topic-reusable and can outlive one concrete file
 * layout. Their semantic acceptance requirements remain useful, but stale target
 * paths must not drive CompletenessGate or Pass 2 after the current architect plan
 * has been filtered through the compiled skeleton contract.
 *
 * This is verification binding only: it never grants write permission. The write
 * allow-list remains requiredSlots + optionalSlots from getProductDeltaScope().
 */
export function bindFeatureChecklistTargetsToProductDeltaPlan<
  T extends ProductDeltaChecklistTargetItem,
>(
  skeletonId: SkeletonId,
  items: readonly T[],
  plannedSpecs: readonly Pick<ProductDeltaSpec, 'path'>[],
): T[] {
  const allowed = new Set(getProductDeltaScope(skeletonId).allowed);
  const plannedPaths = unique(
    plannedSpecs
      .map(spec => normalizeProductDeltaPath(spec.path))
      .filter(path => allowed.has(path)),
  );
  const planned = new Set(plannedPaths);

  if (plannedPaths.length === 0) {
    return items.map(item => ({
      ...item,
      targetFiles: unique(
        item.targetFiles
          .map(normalizeProductDeltaPath)
          .filter(path => allowed.has(path)),
      ),
    }));
  }

  const fallbackTarget =
    plannedPaths.find(path => path === 'App.tsx')
    ?? plannedPaths.find(path => /^pages\/.*\.(?:tsx|jsx)$/i.test(path))
    ?? plannedPaths.find(path => /\.(?:tsx|jsx)$/i.test(path))
    ?? plannedPaths[0];

  return items.map(item => {
    const currentTargets = unique(
      item.targetFiles
        .map(normalizeProductDeltaPath)
        .filter(path => planned.has(path)),
    );
    return {
      ...item,
      targetFiles: currentTargets.length > 0 ? currentTargets : [fallbackTarget],
    };
  });
}

