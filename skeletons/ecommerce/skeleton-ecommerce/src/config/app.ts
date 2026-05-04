export const APP_CONFIG = {
  name: 'AppName',
  /** PRODUCT: tagline shown beneath the wordmark in the header. */
  tagline: 'Things made well, found here.',
  /** ISO currency code. PRODUCT: change to user/region. */
  currency: 'USD',
  /** Free-shipping threshold in major units (USD). */
  freeShippingThreshold: 75,
  storagePrefix: 'app.v1',
} as const;

export const STORAGE_KEYS = {
  cart: `${APP_CONFIG.storagePrefix}.cart`,
  wishlist: `${APP_CONFIG.storagePrefix}.wishlist`,
  recentlyViewed: `${APP_CONFIG.storagePrefix}.recently-viewed`,
  theme: `${APP_CONFIG.storagePrefix}.theme`,
  account: `${APP_CONFIG.storagePrefix}.account`,
} as const;
