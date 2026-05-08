/**
 * Centralized route paths. All navigation uses these constants —
 * never hardcoded strings. Adding a new screen means adding it here first.
 */
export const ROUTES = {
  onboarding: '/onboarding',
  home: '/home',
  detail: '/detail/:id',
  create: '/create',
  progress: '/progress',
  profile: '/profile',
} as const;

export type RouteKey = keyof typeof ROUTES;

/** Builds /detail/:id with the actual id substituted. */
export function detailRoute(id: string): string {
  return ROUTES.detail.replace(':id', encodeURIComponent(id));
}
