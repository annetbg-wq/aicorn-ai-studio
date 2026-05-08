import { Check, X } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { Progress } from './ui/Progress';
import { Button } from './ui/Button';
import { cn } from '@/lib/cn';

/**
 * First-run checklist overlay. Persists across sessions; can be dismissed.
 * PRODUCT: rewrite tasks to match the activation milestones for this product.
 */
export function OnboardingChecklist(): JSX.Element | null {
  const { checklist, toggleTask, dismissChecklist, isChecklistDismissed } = useApp();

  const done = checklist.filter((t) => t.done).length;
  const allDone = done === checklist.length;

  if (isChecklistDismissed || allDone) return null;

  const pct = (done / checklist.length) * 100;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle>Get started</CardTitle>
          <p className="text-sm text-muted-foreground">
            Finish these steps to set up your workspace.
          </p>
        </div>
        <button
          type="button"
          onClick={dismissChecklist}
          aria-label="Dismiss checklist"
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          <Progress value={pct} className="flex-1" />
          <span className="text-xs font-medium tabular-nums text-muted-foreground">
            {done}/{checklist.length}
          </span>
        </div>
        <ul className="space-y-1.5">
          {checklist.map((task) => (
            <li key={task.id}>
              <button
                type="button"
                onClick={() => toggleTask(task.id)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                  'hover:bg-card',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors',
                    task.done
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border',
                  )}
                >
                  {task.done && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
                <span
                  className={cn(
                    task.done && 'text-muted-foreground line-through',
                  )}
                >
                  {task.label}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {allDone && (
          <Button size="sm" variant="ghost" className="w-full" onClick={dismissChecklist}>
            Hide checklist
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
