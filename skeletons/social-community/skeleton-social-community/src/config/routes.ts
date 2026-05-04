export const ROUTES = {
  feed: '/',
  explore: '/explore',
  create: '/create',
  notifications: '/notifications',
  profile: '/profile/:userId',
  myProfile: '/me',
  postDetail: '/post/:postId',
} as const;

export type RouteKey = keyof typeof ROUTES;

export function profileRoute(userId: string): string {
  return ROUTES.profile.replace(':userId', encodeURIComponent(userId));
}

export function postRoute(postId: string): string {
  return ROUTES.postDetail.replace(':postId', encodeURIComponent(postId));
}
