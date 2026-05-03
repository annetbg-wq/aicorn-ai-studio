/**
 * Single source of truth for app-wide identity values.
 * The AI agent rewrites these strings; everything else imports from here.
 */
export const APP_CONFIG = {
  /** Display name. Used in <title>, headers, branding. */
  name: 'AppName',
  /** Short tagline shown on welcome screen. PRODUCT: rewrite. */
  tagline: 'A short, calm space to make consistent progress.',
  /** Number of free actions before paywall is offered. */
  freeActionLimit: 3,
  /** localStorage key prefix. Bump version on breaking schema changes. */
  storagePrefix: 'app.v1',
} as const;

export const STORAGE_KEYS = {
  profile: `${APP_CONFIG.storagePrefix}.profile`,
  theme: `${APP_CONFIG.storagePrefix}.theme`,
  feed: `${APP_CONFIG.storagePrefix}.feed`,
  progress: `${APP_CONFIG.storagePrefix}.progress`,
} as const;
