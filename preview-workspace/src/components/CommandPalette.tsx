import { useEffect, useState, type KeyboardEvent } from 'react';
import { Layout, FileText, Search } from 'lucide-react';
import { Dialog, DialogContent } from './ui/Dialog';
import { Input } from './ui/Input';
import { useCommandPalette } from '@/hooks/useCommandPalette';
import { useApp } from '@/context/AppContext';
import { cn } from '@/lib/cn';

const ICON_BY_TYPE = {
  item: FileText,
  workspace: Layout,
};

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps): JSX.Element {
  const { items, workspaces, openItem, setActiveWorkspaceId } = useApp();
  const palette = useCommandPalette({
    items,
    workspaces,
    onOpenItem: (id) => {
      openItem(id);
      onOpenChange(false);
    },
    onOpenWorkspace: (id) => {
      setActiveWorkspaceId(id);
      onOpenChange(false);
    },
  });
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    setHighlight(0);
  }, [palette.query, open]);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight((h) => Math.min(palette.results.length - 1, h + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const result = palette.results[highlight];
      if (result) result.onActivate();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 max-w-lg">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            value={palette.query}
            onChange={(e) => palette.setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search items, workspaces..."
            aria-label="Command palette search"
            className="h-9 border-0 bg-transparent px-0 focus-visible:ring-0"
          />
          <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-block">
            ESC
          </kbd>
        </div>

        <ul role="listbox" aria-label="Command results" className="max-h-72 overflow-y-auto p-1">
          {palette.results.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">No matches.</li>
          ) : (
            palette.results.map((result, i) => {
              const Icon = ICON_BY_TYPE[result.type];
              const active = i === highlight;
              return (
                <li key={result.id}>
                  <button
                    type="button"
                    onClick={result.onActivate}
                    onMouseEnter={() => setHighlight(i)}
                    role="option"
                    aria-selected={active}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-md px-2 py-2 text-left',
                      'transition-colors',
                      active ? 'bg-muted' : 'hover:bg-muted',
                    )}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{result.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{result.subtitle}</p>
                    </div>
                  </button>
                </li>
              );
            })
          )}
        </ul>

        <footer className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-1.5 text-[10px] text-muted-foreground">
          <div className="flex gap-3">
            <span>↑↓ navigate</span>
            <span>↵ select</span>
          </div>
          <span>{palette.results.length} results</span>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
