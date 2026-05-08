import { useState } from 'react';
import { Inbox } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { ItemCard } from './ItemCard';
import { EmptyState } from './EmptyState';
import { cn } from '@/lib/cn';
import type { Item, ItemStatus } from '@/data/types';

interface KanbanBoardProps {
  items: readonly Item[];
}

interface ColumnDef {
  id: ItemStatus;
  label: string;
  accent: string;
}

const COLUMNS: readonly ColumnDef[] = [
  { id: 'backlog',     label: 'Backlog',     accent: 'bg-muted-foreground/20' },
  { id: 'in_progress', label: 'In progress', accent: 'bg-primary/40' },
  { id: 'in_review',   label: 'In review',   accent: 'bg-warning/40' },
  { id: 'done',        label: 'Done',        accent: 'bg-success/40' },
] as const;

/**
 * Native HTML5 drag-and-drop. No external library — items are draggable
 * via ItemCard and columns accept drops to update their status.
 */
export function KanbanBoard({ items }: KanbanBoardProps): JSX.Element {
  const { openItem, setItemStatus } = useApp();
  const [dragOver, setDragOver] = useState<ItemStatus | null>(null);

  const grouped = COLUMNS.map((col) => ({
    column: col,
    items: items.filter((it) => it.status === col.id),
  }));

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="No work yet"
        description="Items added to this workspace will appear here."
      />
    );
  }

  return (
    <div className="grid h-full grid-cols-1 gap-3 overflow-x-auto p-4 sm:grid-cols-2 lg:grid-cols-4">
      {grouped.map(({ column, items: columnItems }) => (
        <section
          key={column.id}
          aria-label={column.label}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (dragOver !== column.id) setDragOver(column.id);
          }}
          onDragLeave={() => {
            if (dragOver === column.id) setDragOver(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            const id = e.dataTransfer.getData('text/plain');
            if (id) setItemStatus(id, column.id);
            setDragOver(null);
          }}
          className={cn(
            'flex min-h-0 flex-col rounded-lg border bg-muted/30 transition-colors',
            dragOver === column.id ? 'border-primary bg-primary/5' : 'border-border',
          )}
        >
          <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <div className="flex items-center gap-2">
              <span aria-hidden className={cn('h-2 w-2 rounded-full', column.accent)} />
              <h2 className="text-xs font-medium uppercase tracking-wider">{column.label}</h2>
            </div>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {columnItems.length}
            </span>
          </header>

          <ul className="flex-1 space-y-2 overflow-y-auto p-2">
            {columnItems.length === 0 ? (
              <li className="rounded-md border border-dashed border-border px-3 py-6 text-center text-[11px] text-muted-foreground">
                Drop here
              </li>
            ) : (
              columnItems.map((item) => (
                <li key={item.id}>
                  <ItemCard item={item} onClick={() => openItem(item.id)} />
                </li>
              ))
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}
