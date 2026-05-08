import { Calendar, Inbox } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Avatar, AvatarFallback } from './ui/Avatar';
import { Badge } from './ui/Badge';
import { EmptyState } from './EmptyState';
import { cn } from '@/lib/cn';
import type { Item, ItemStatus, Priority } from '@/data/types';

interface ListViewProps {
  items: readonly Item[];
}

const STATUS_LABEL: Record<ItemStatus, string> = {
  backlog: 'Backlog',
  in_progress: 'In progress',
  in_review: 'In review',
  done: 'Done',
};

const STATUS_TONE: Record<ItemStatus, string> = {
  backlog: 'bg-muted-foreground/20',
  in_progress: 'bg-primary/50',
  in_review: 'bg-warning/50',
  done: 'bg-success/50',
};

const PRIORITY_TONE: Record<Priority, string> = {
  low: 'text-muted-foreground',
  medium: 'text-primary',
  high: 'text-warning',
  urgent: 'text-rose',
};

const COLOR_TO_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'rose' | 'violet'> = {
  primary: 'default',
  success: 'success',
  warning: 'warning',
  rose: 'rose',
  violet: 'violet',
};

const DATE_FMT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

export function ListView({ items }: ListViewProps): JSX.Element {
  const { tags, openItem } = useApp();

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="No items match"
        description="Try adjusting filters or search."
      />
    );
  }

  return (
    <ul className="divide-y divide-border">
      {items.map((item) => {
        const itemTags = tags.filter((t) => item.tagIds.includes(t.id));
        const dueDate = item.dueDate ? new Date(item.dueDate) : null;
        const overdue = dueDate ? dueDate.getTime() < Date.now() && item.status !== 'done' : false;

        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => openItem(item.id)}
              className="grid w-full cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
            >
              <span
                aria-label={STATUS_LABEL[item.status]}
                className={cn('h-2 w-2 rounded-full', STATUS_TONE[item.status])}
              />

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{item.title}</span>
                  <span
                    className={cn(
                      'text-[10px] font-medium uppercase tracking-wider',
                      PRIORITY_TONE[item.priority],
                    )}
                  >
                    {item.priority}
                  </span>
                </div>
                {itemTags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {itemTags.map((tag) => (
                      <Badge key={tag.id} variant={COLOR_TO_VARIANT[tag.color] ?? 'default'}>
                        {tag.label}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {dueDate && (
                  <span className={cn('inline-flex items-center gap-1', overdue && 'text-rose font-medium')}>
                    <Calendar className="h-3 w-3" />
                    {DATE_FMT.format(dueDate)}
                  </span>
                )}
                {item.assignee && (
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="text-[10px]">
                      {item.assignee[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
