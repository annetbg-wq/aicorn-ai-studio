import { Home, Compass, PlusSquare, Bell, User, type LucideIcon } from 'lucide-react';
import { ROUTES } from './routes';

export interface TabDefinition {
  to: string;
  label: string;
  icon: LucideIcon;
  primary?: boolean;
}

/**
 * Five-tab bottom navigation. Center is the elevated Create action.
 * Profile points at /me — the current user — not /profile/:userId.
 */
export const BOTTOM_TABS: readonly TabDefinition[] = [
  { to: ROUTES.feed, label: 'Feed', icon: Home },
  { to: ROUTES.explore, label: 'Explore', icon: Compass },
  { to: ROUTES.create, label: 'Create', icon: PlusSquare, primary: true },
  { to: ROUTES.notifications, label: 'Notifications', icon: Bell },
  { to: ROUTES.myProfile, label: 'You', icon: User },
] as const;
