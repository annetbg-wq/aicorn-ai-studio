export const APP_CONFIG = {
  name: 'Привычки',
  language: 'ru',
  defaultHabitColor: '211 78% 46%',
  defaultGoal: 1,
  streakColors: {
    short: '38 92% 50%',
    long: '0 72% 50%',
  },
  pagination: {
    pageSize: 10,
  },
  onboarding: {
    steps: 3,
  },
};

// Auto-patched by preview-manager: required by skeleton hooks.
export const STORAGE_KEYS = {
  profile: `${typeof APP_CONFIG !== 'undefined' ? APP_CONFIG.storagePrefix : 'app.v1'}.profile`,
  theme: `${typeof APP_CONFIG !== 'undefined' ? APP_CONFIG.storagePrefix : 'app.v1'}.theme`,
  feed: `${typeof APP_CONFIG !== 'undefined' ? APP_CONFIG.storagePrefix : 'app.v1'}.feed`,
  progress: `${typeof APP_CONFIG !== 'undefined' ? APP_CONFIG.storagePrefix : 'app.v1'}.progress`,
} as const;
