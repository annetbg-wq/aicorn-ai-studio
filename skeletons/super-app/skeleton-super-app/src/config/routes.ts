export const ROUTES = {
  onboarding: '/onboarding',
  home: '/home',
  finance: '/finance',
  wellness: '/wellness',
  learning: '/learning',
  profile: '/profile',
} as const;

export type RouteKey = keyof typeof ROUTES;
