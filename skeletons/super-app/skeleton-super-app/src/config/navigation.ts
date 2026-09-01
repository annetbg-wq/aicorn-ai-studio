import { Home as HomeIcon, WalletCards, HeartPulse, GraduationCap, User, type LucideIcon } from 'lucide-react';
import { ROUTES } from './routes';

export interface TabDefinition {
  to: string;
  label: string;
  icon: LucideIcon;
  primary?: boolean;
}

export const BOTTOM_TABS: readonly TabDefinition[] = [
  { to: ROUTES.home, label: 'Home', icon: HomeIcon },
  { to: ROUTES.finance, label: 'Money', icon: WalletCards },
  { to: ROUTES.wellness, label: 'Wellness', icon: HeartPulse, primary: true },
  { to: ROUTES.learning, label: 'Learn', icon: GraduationCap },
  { to: ROUTES.profile, label: 'Profile', icon: User },
] as const;
