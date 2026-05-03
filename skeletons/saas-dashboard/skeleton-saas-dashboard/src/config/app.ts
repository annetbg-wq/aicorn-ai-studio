/**
 * Single source of truth for app-wide identity.
 */
export const APP_CONFIG = {
  name: 'AppName',
  /** PRODUCT: short tagline shown in onboarding checklist. */
  tagline: 'The workspace your team has been waiting for.',
  storagePrefix: 'app.v1',
} as const;

export const STORAGE_KEYS = {
  profile: `${APP_CONFIG.storagePrefix}.profile`,
  theme: `${APP_CONFIG.storagePrefix}.theme`,
  data: `${APP_CONFIG.storagePrefix}.data`,
  onboardingChecklist: `${APP_CONFIG.storagePrefix}.onboarding`,
  sidebarCollapsed: `${APP_CONFIG.storagePrefix}.sidebar`,
} as const;
