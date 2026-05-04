import { Calendar, MessageSquare } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Avatar, AvatarFallback } from './ui/Avatar';
import { Badge } from './ui/Badge';
import { cn } from '@/lib/cn';
import type { Item, Priority } from '@/data/types';

interface ItemCardProps {
  item: Item;
  onClick: () => void;
}

const PRIORITY_TONE: Record<Priority, string> = {
  low: 'text-muted-foreground',
  medium: 'text-primary',
  high: 'text-warning',
  urgent: 'text-rose',
};

const DATE_FMT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

const COLOR_TO_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'rose' | 'violet'> = {
  primary: 'default',
  success: 'success',
  warning: 'warning',
  rose: 'rose',
  violet: 'violet',
};

export function ItemCard({ item, onClick }: ItemCardProps): JSX.Element {
  const { tags } = useApp();
  const itemTags = tags.filter((t) => item.tagIds.includes(t.id));
  const dueDate = item.dueDate ? new Date(item.dueDate) : null;
  const overdue = dueDate ? dueDate.getTime() < Date.now() && item.status !== 'done' : false;

  return (
    <button
      type="button"
      onClick={onClick}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', item.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      className="group block w-full cursor-grab rounded-md border border-border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/40 active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <span className={cn('text-[10px] font-medium uppercase tracking-wider', PRIORITY_TONE[item.priority])}>
          {item.priority}
        </span>
      </div>

      <h3 className="mt-1 text-sm font-medium leading-snug">{item.title}</h3>

      {itemTags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {itemTags.map((tag) => (
            <Badge key={tag.id} variant={COLOR_TO_VARIANT[tag.color] ?? 'default'}>
              {tag.label}
            </Badge>
          ))}
        </div>
      )}

      <footer className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
        {dueDate && (
          <span className={cn('inline-flex items-center gap-1', overdue && 'text-rose font-medium')}>
            <Calendar className="h-3 w-3" />
            {DATE_FMT.format(dueDate)}
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <MessageSquare className="h-3 w-3" />0
        </span>
        {item.assignee && (
          <Avatar className="ml-auto h-5 w-5">
            <AvatarFallback className="text-[9px]">
              {item.assignee[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
        )}
      </footer>
    </button>
  );
}
