import { Calendar, User, Trash2 } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './ui/Sheet';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/Select';
import { Avatar, AvatarFallback } from './ui/Avatar';
import { useApp } from '@/context/AppContext';
import type { ItemStatus } from '@/data/types';

const COLOR_TO_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'rose' | 'violet'> = {
  primary: 'default',
  success: 'success',
  warning: 'warning',
  rose: 'rose',
  violet: 'violet',
};

const DATE_FMT = new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', year: 'numeric' });

export function ItemDetailSheet(): JSX.Element {
  const { items, tags, openItemId, openItem, setItemStatus, workspaces } = useApp();
  const item = items.find((it) => it.id === openItemId);
  const workspace = item ? workspaces.find((w) => w.id === item.workspaceId) : undefined;

  return (
    <Sheet open={openItemId !== null} onOpenChange={(open) => !open && openItem(null)}>
      <SheetContent className="max-w-lg">
        {item && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2">
                {workspace && (
                  <span className="text-xs text-muted-foreground">
                    {workspace.icon} {workspace.name}
                  </span>
                )}
                <span
                  className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
                >
                  · {item.priority}
                </span>
              </div>
              <SheetTitle>{item.title}</SheetTitle>
              {item.description && <SheetDescription>{item.description}</SheetDescription>}
            </SheetHeader>

            <div className="space-y-4">
              <Field label="Status">
                <Select
                  value={item.status}
                  onValueChange={(v) => setItemStatus(item.id, v as ItemStatus)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="backlog">Backlog</SelectItem>
                    <SelectItem value="in_progress">In progress</SelectItem>
                    <SelectItem value="in_review">In review</SelectItem>
                    <SelectItem value="done">Done</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              {item.assignee && (
                <Field label="Assignee">
                  <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5">
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="text-[10px]">
                        {item.assignee[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm">{item.assignee}</span>
                  </div>
                </Field>
              )}

              {item.dueDate && (
                <Field label="Due">
                  <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    {DATE_FMT.format(new Date(item.dueDate))}
                  </div>
                </Field>
              )}

              {item.tagIds.length > 0 && (
                <Field label="Tags">
                  <div className="flex flex-wrap gap-1.5">
                    {tags
                      .filter((t) => item.tagIds.includes(t.id))
                      .map((tag) => (
                        <Badge key={tag.id} variant={COLOR_TO_VARIANT[tag.color] ?? 'default'}>
                          {tag.label}
                        </Badge>
                      ))}
                  </div>
                </Field>
              )}

              {/* PRODUCT: agent adds comments thread, attachments, activity log here. */}
              <section
                aria-label="Activity"
                className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-center text-xs text-muted-foreground"
              >
                Comments and activity will appear here.
              </section>

              <div className="flex justify-end pt-2">
                <Button variant="outline" size="sm" className="text-rose hover:text-rose">
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

interface FieldProps {
  label: string;
  children: React.ReactNode;
}

function Field({ label, children }: FieldProps): JSX.Element {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <User className="h-3 w-3" aria-hidden />
        {label}
      </label>
      {children}
    </div>
  );
}
