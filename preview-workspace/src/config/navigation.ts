import { Home as HomeIcon, BarChart3, User, Plus, type LucideIcon } from 'lucide-react';
import { ROUTES } from './routes';

export interface TabDefinition {
  /** Path the tab navigates to — must exist in the router. */
  to: string;
  /** Visible label under the icon. */
  label: string;
  /** Lucide icon component. */
  icon: LucideIcon;
  /** Whether this tab is the elevated FAB-style center action. */
  primary?: boolean;
}

/**
 * Four tabs by default — every one points to a real registered route.
 * Adding a new tab requires:
 *   1. add the route to ROUTES + register in App.tsx
 *   2. push a new entry here
 *
 * PRODUCT: agent may rebind the `primary` action to the product's main flow.
 */
export const BOTTOM_TABS: readonly TabDefinition[] = [
  { to: ROUTES.home, label: 'Home', icon: HomeIcon },
  { to: ROUTES.create, label: 'Create', icon: Plus, primary: true },
  { to: ROUTES.progress, label: 'Progress', icon: BarChart3 },
  { to: ROUTES.profile, label: 'Profile', icon: User },
] as const;
