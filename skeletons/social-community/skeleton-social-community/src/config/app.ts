export const APP_CONFIG = {
  name: 'AppName',
  /** PRODUCT: short tagline shown in empty states. */
  tagline: 'A calm space for the people you actually want to hear from.',
  storagePrefix: 'app.v1',
} as const;

export const STORAGE_KEYS = {
  profile: `${APP_CONFIG.storagePrefix}.profile`,
  theme: `${APP_CONFIG.storagePrefix}.theme`,
  posts: `${APP_CONFIG.storagePrefix}.posts`,
  follows: `${APP_CONFIG.storagePrefix}.follows`,
  notifications: `${APP_CONFIG.storagePrefix}.notifications`,
} as const;
