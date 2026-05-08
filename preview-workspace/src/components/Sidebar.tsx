import { NavLink } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { APP_CONFIG } from '@/config/app';
import { SIDEBAR_NAV } from '@/config/navigation';
import { cn } from '@/lib/cn';

/**
 * Collapsible sidebar with grouped navigation.
 * State is persisted in localStorage via AppContext.
 */
export function Sidebar(): JSX.Element {
  const { sidebarCollapsed, setSidebarCollapsed } = useApp();

  return (
    <aside
      className={cn(
        'hidden border-r border-border bg-card transition-all duration-200 md:flex md:flex-col',
        sidebarCollapsed ? 'md:w-16' : 'md:w-60',
      )}
    >
      <div className="flex h-14 items-center justify-between border-b border-border px-4">
        {!sidebarCollapsed && (
          <span className="truncate text-sm font-semibold tracking-tight">{APP_CONFIG.name}</span>
        )}
        <button
          type="button"
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {sidebarCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>

      <nav aria-label="Primary" className="flex-1 overflow-y-auto p-2">
        {SIDEBAR_NAV.map((group) => (
          <div key={group.label} className="mb-3">
            {!sidebarCollapsed && (
              <h2 className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {group.label}
              </h2>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm font-medium',
                        'transition-colors',
                        isActive
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )
                    }
                  >
                    <item.icon className="h-4 w-4 flex-shrink-0" />
                    {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
