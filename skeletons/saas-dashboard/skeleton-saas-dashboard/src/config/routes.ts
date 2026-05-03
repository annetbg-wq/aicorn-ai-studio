export const ROUTES = {
  dashboard: '/',
  data: '/data',
  settings: '/settings',
  settingsGeneral: '/settings/general',
  settingsTeam: '/settings/team',
  settingsBilling: '/settings/billing',
  settingsApi: '/settings/api',
} as const;

export type RouteKey = keyof typeof ROUTES;
