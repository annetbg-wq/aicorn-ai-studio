export const APP_CONFIG = {
  name: 'AppName',
  /** PRODUCT: tagline for empty workspace state. */
  tagline: 'Track work the way your team actually thinks.',
  storagePrefix: 'app.v1',
} as const;

export const STORAGE_KEYS = {
  workspace: `${APP_CONFIG.storagePrefix}.workspace`,
  items: `${APP_CONFIG.storagePrefix}.items`,
  view: `${APP_CONFIG.storagePrefix}.view`,
  theme: `${APP_CONFIG.storagePrefix}.theme`,
  filters: `${APP_CONFIG.storagePrefix}.filters`,
} as const;
