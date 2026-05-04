export const ROUTES = {
  home: '/',
  search: '/search',
  product: '/product/:productId',
  cart: '/cart',
  checkout: '/checkout',
  wishlist: '/wishlist',
  account: '/account',
} as const;

export type RouteKey = keyof typeof ROUTES;

export function productRoute(productId: string): string {
  return ROUTES.product.replace(':productId', encodeURIComponent(productId));
}
