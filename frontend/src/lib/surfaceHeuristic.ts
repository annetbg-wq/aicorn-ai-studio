/**
 * surfaceHeuristic.ts — Auto-surface selection when the user does not make an
 * explicit choice within the surface-choice timeout window.
 *
 * Exported as a pure utility so it can be unit-tested independently of the hook.
 */

export type AutoSurface = 'app' | 'superapp';

/** How long (ms) the pipeline waits for a user surface choice before auto-selecting. */
export const SURFACE_CHOICE_TIMEOUT_MS = 60_000;

const SUPER_PATTERNS: RegExp[] = [
  /super[- ]?app/i,
  /ecosystem/i,
  /operating[- ]?system/i,
  /\bos\s+for\b/i,
  /mega[- ]?app/i,
  /all[- ]in[- ]one/i,
  /full\s+ecosystem/i,
  /everything\s+in\s+one/i,
  /all\s+modules/i,
  /every\s+module/i,
  /digital\s+ecosystem/i,
  /multi[- ]?module/i,
  /omni[- ]?platform/i,
];

/**
 * Classify the user's prompt and return the best surface type.
 *
 * Rules (in priority order):
 *   SUPER → prompt clearly describes a broad super-app / many modules /
 *             ecosystem / OS-style product
 *   APP   → everything else (default)
 */
export function autoSelectSurface(prompt: string): AutoSurface {
  if (SUPER_PATTERNS.some(p => p.test(prompt))) return 'superapp';
  return 'app';
}
