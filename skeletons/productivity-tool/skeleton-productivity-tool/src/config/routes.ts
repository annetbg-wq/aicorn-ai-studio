export const ROUTES = {
  workspace: '/',
  workspaceById: '/workspace/:workspaceId',
} as const;

export type RouteKey = keyof typeof ROUTES;

export function workspaceRoute(workspaceId: string): string {
  return ROUTES.workspaceById.replace(':workspaceId', encodeURIComponent(workspaceId));
}
