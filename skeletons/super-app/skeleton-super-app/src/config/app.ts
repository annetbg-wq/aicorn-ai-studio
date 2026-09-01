export const APP_CONFIG = {
  name: 'AppName',
  tagline: 'One calm place for the parts of life that matter.',
  freeActionLimit: 5,
  storagePrefix: 'super-app.v1',
} as const;

export const STORAGE_KEYS = {
  profile: `${APP_CONFIG.storagePrefix}.profile`,
  theme: `${APP_CONFIG.storagePrefix}.theme`,
  feed: `${APP_CONFIG.storagePrefix}.feed`,
  progress: `${APP_CONFIG.storagePrefix}.progress`,
} as const;
