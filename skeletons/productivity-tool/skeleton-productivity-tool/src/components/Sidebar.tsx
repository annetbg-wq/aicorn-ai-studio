import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { APP_CONFIG } from '@/config/app';
import { SIDEBAR_FILTERS } from '@/config/navigation';
import { cn } from '@/lib/cn';

/**
 * Sidebar with two zones:
 *   1. Static filters (All / Inbox / Starred / Archive)
 *   2. Dynamic workspace list (from AppContext)
 *
 * Selecting a workspace updates `activeWorkspaceId`. The current selection
 * is highlighted; clicking it again does nothing (no-op, no toggle).
 */
export function Sidebar(): JSX.Element {
  const {
    workspaces,
    activeWorkspaceId,
    setActiveWorkspaceId,
    sidebarCollapsed,
    setSidebarCollapsed,
  } = useApp();

  return (
    <aside
      className={cn(
        'hidden border-r border-border bg-card transition-all duration-200 md:flex md:flex-col',
        sidebarCollapsed ? 'md:w-16' : 'md:w-64',
      )}
    >
      <div className="flex h-12 items-center justify-between border-b border-border px-3">
        {!sidebarCollapsed && (
          <span className="truncate text-sm font-semibold tracking-tight">{APP_CONFIG.name}</span>
        )}
        <button
          type="button"
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      <nav aria-label="Primary" className="flex-1 overflow-y-auto p-2">
        <ul className="space-y-0.5">
          {SIDEBAR_FILTERS.map((filter) => (
            <li key={filter.id}>
              <button
                type="button"
                onClick={() => setActiveWorkspaceId(filter.id === 'all' ? 'all' : filter.id)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm font-medium',
                  'transition-colors',
                  activeWorkspaceId === filter.id || (activeWorkspaceId === 'all' && filter.id === 'all')
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <filter.icon className="h-4 w-4 flex-shrink-0" />
                {!sidebarCollapsed && <span className="truncate">{filter.label}</span>}
              </button>
            </li>
          ))}
        </ul>

        {!sidebarCollapsed && (
          <h2 className="mt-4 flex items-center justify-between px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Workspaces
            <button
              type="button"
              aria-label="New workspace"
              className="rounded-md p-0.5 hover:bg-muted hover:text-foreground"
            >
              <Plus className="h-3 w-3" />
            </button>
          </h2>
        )}

        <ul className="space-y-0.5">
          {workspaces.map((ws) => (
            <li key={ws.id}>
              <button
                type="button"
                onClick={() => setActiveWorkspaceId(ws.id)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm font-medium',
                  'transition-colors',
                  activeWorkspaceId === ws.id
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <span
                  aria-hidden
                  className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-xs"
                >
                  {ws.icon}
                </span>
                {!sidebarCollapsed && (
                  <>
                    <span className="truncate flex-1 text-left">{ws.name}</span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {ws.itemCount}
                    </span>
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
