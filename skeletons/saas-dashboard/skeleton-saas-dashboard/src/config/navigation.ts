import { LayoutDashboard, Database, Settings, type LucideIcon } from 'lucide-react';
import { ROUTES } from './routes';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  items: readonly NavItem[];
}

/**
 * Sidebar navigation. Each item points at a real registered route.
 * Adding a section means: add to ROUTES, register in App.tsx, add here.
 */
export const SIDEBAR_NAV: readonly NavGroup[] = [
  {
    label: 'Workspace',
    items: [
      { to: ROUTES.dashboard, label: 'Dashboard', icon: LayoutDashboard },
      { to: ROUTES.data, label: 'Data', icon: Database },
    ],
  },
  {
    label: 'Account',
    items: [{ to: ROUTES.settings, label: 'Settings', icon: Settings }],
  },
] as const;
