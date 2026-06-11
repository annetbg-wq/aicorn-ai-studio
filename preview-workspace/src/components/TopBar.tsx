import { useLocation } from 'react-router-dom';
import { Bell, Search } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { ROUTES } from '@/config/routes';
import { Avatar, AvatarFallback } from './ui/Avatar';
import { Input } from './ui/Input';

const ROUTE_LABELS: Record<string, string> = {
  [ROUTES.dashboard]: 'Dashboard',
  [ROUTES.data]: 'Data',
  [ROUTES.settings]: 'Settings',
  [ROUTES.settingsGeneral]: 'Settings · General',
  [ROUTES.settingsTeam]: 'Settings · Team',
  [ROUTES.settingsBilling]: 'Settings · Billing',
  [ROUTES.settingsApi]: 'Settings · API',
};

export function TopBar(): JSX.Element {
  const location = useLocation();
  const { profile } = useApp();

  // Resolve breadcrumb label, falling back to the parent route.
  const label =
    ROUTE_LABELS[location.pathname] ??
    ROUTE_LABELS[location.pathname.split('/').slice(0, -1).join('/')] ??
    'Workspace';

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border bg-card/95 px-4 backdrop-blur">
      <h1 className="flex-shrink-0 text-sm font-semibold tracking-tight">{label}</h1>

      <div className="hidden flex-1 max-w-md md:block">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          {/* PRODUCT: wire up command-palette / global search. */}
          <Input
            type="search"
            placeholder="Search..."
            className="pl-9"
            aria-label="Global search"
          />
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          aria-label="Notifications"
          className="relative rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-rose" aria-hidden />
        </button>
        <Avatar className="h-8 w-8">
          <AvatarFallback className="text-xs">
            {(profile.name[0] ?? '·').toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
