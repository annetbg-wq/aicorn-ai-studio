import { Home, Search, Heart, ShoppingBag, User, type LucideIcon } from 'lucide-react';
import { ROUTES } from './routes';

export interface TabDefinition {
  to: string;
  label: string;
  icon: LucideIcon;
  /** When true, badge slot is reserved for cart-count / wishlist-count overlay. */
  badge?: 'cart' | 'wishlist';
}

/**
 * Five-tab bottom nav. Cart shows a count badge derived from CartContext.
 */
export const BOTTOM_TABS: readonly TabDefinition[] = [
  { to: ROUTES.home, label: 'Shop', icon: Home },
  { to: ROUTES.search, label: 'Search', icon: Search },
  { to: ROUTES.wishlist, label: 'Saved', icon: Heart, badge: 'wishlist' },
  { to: ROUTES.cart, label: 'Bag', icon: ShoppingBag, badge: 'cart' },
  { to: ROUTES.account, label: 'Account', icon: User },
] as const;
