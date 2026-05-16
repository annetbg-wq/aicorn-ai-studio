import { Home, PlusCircle, BarChart3, User, type LucideIcon } from 'lucide-react';
import { ROUTES } from './routes';

export interface TabDefinition {
  to: string;
  label: string;
  icon: LucideIcon;
  primary?: boolean;
}

export const BOTTOM_TABS: readonly TabDefinition[] = [
  { to: ROUTES.home, label: 'Главная', icon: Home },
  { to: ROUTES.create, label: 'Создать', icon: PlusCircle, primary: true },
  { to: ROUTES.progress, label: 'Прогресс', icon: BarChart3 },
  { to: ROUTES.profile, label: 'Профиль', icon: User },
] as const;

/** @deprecated use BOTTOM_TABS */
export const NAV_ITEMS = BOTTOM_TABS.map((t) => ({
  id: t.to.replace('/', '') || 'home',
  label: t.label,
  icon: t.icon,
  path: t.to,
}));

