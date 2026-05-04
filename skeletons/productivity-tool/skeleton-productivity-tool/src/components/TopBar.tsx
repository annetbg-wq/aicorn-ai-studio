import { LayoutGrid, List, Search, Plus } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Button } from './ui/Button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/Select';
import { Input } from './ui/Input';
import { cn } from '@/lib/cn';
import type { Priority, ItemStatus } from '@/data/types';

interface TopBarProps {
  onOpenCommand: () => void;
}

export function TopBar({ onOpenCommand }: TopBarProps): JSX.Element {
  const { workspaces, activeWorkspaceId, view, setView, filters, setFilters } = useApp();
  const activeWs = workspaces.find((w) => w.id === activeWorkspaceId);
  const title = activeWs ? activeWs.name : 'All work';

  return (
    <header className="flex flex-col gap-3 border-b border-border bg-card/95 px-4 py-3 backdrop-blur md:flex-row md:items-center">
      <div className="flex flex-1 items-center gap-3">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>

        <div className="hidden flex-1 max-w-sm md:block">
          <button
            type="button"
            onClick={onOpenCommand}
            className="flex w-full items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
            aria-label="Open command palette"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Search</span>
            <kbd className="ml-auto rounded border border-border bg-card px-1.5 py-0.5 text-[10px] font-medium">
              ⌘K
            </kbd>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="md:hidden flex-1">
          <Input
            type="search"
            value={filters.query}
            onChange={(e) => setFilters({ query: e.target.value })}
            placeholder="Filter..."
            aria-label="Filter items"
          />
        </div>

        <Select
          value={filters.status}
          onValueChange={(v) => setFilters({ status: v as ItemStatus | 'all' })}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="backlog">Backlog</SelectItem>
            <SelectItem value="in_progress">In progress</SelectItem>
            <SelectItem value="in_review">In review</SelectItem>
            <SelectItem value="done">Done</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.priority}
          onValueChange={(v) => setFilters({ priority: v as Priority | 'all' })}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-1 rounded-md border border-border bg-background p-0.5">
          <ViewToggle active={view === 'kanban'} onClick={() => setView('kanban')} icon={LayoutGrid} label="Board" />
          <ViewToggle active={view === 'list'} onClick={() => setView('list')} icon={List} label="List" />
        </div>

        <Button size="sm">
          <Plus className="h-4 w-4" />
          New
        </Button>
      </div>
    </header>
  );
}

interface ViewToggleProps {
  active: boolean;
  onClick: () => void;
  icon: typeof LayoutGrid;
  label: string;
}

function ViewToggle({ active, onClick, icon: Icon, label }: ViewToggleProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors',
        active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
