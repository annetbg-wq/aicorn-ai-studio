import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { SEED_PROGRESS } from '@/data/seed';
import { cn } from '@/lib/cn';

const WEEK_DAY_FORMATTER = new Intl.DateTimeFormat(undefined, { weekday: 'short' });

export default function Progress(): JSX.Element {
  /* SEED: replace with computed progress from real activity. */
  const entries = SEED_PROGRESS;

  const stats = useMemo(() => {
    const total = entries.reduce((sum, entry) => sum + entry.value, 0);
    const goalsMet = entries.filter((entry) => entry.goalMet).length;
    const streak = computeStreak(entries);
    return { total, goalsMet, streak, totalDays: entries.length };
  }, [entries]);

  const maxValue = Math.max(1, ...entries.map((e) => e.value));

  return (
    <div className="flex min-h-full flex-col safe-top">
      <header className="px-5 pb-3 pt-6">
        <h1 className="text-2xl font-semibold tracking-tight">Progress</h1>
        {/* PRODUCT: replace with a metric description that fits the product. */}
        <p className="mt-1 text-sm text-muted-foreground">Last seven days at a glance</p>
      </header>

      <main className="flex-1 space-y-4 px-5 pb-32">
        <div className="grid grid-cols-3 gap-3">
          <StatTile label="Streak" value={`${stats.streak}d`} accent="primary" />
          <StatTile label="Done" value={`${stats.goalsMet}/${stats.totalDays}`} accent="success" />
          <StatTile label="Total" value={String(stats.total)} accent="muted" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>This week</CardTitle>
            <CardDescription>Daily activity, goal-met days are filled.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between gap-2 pt-2">
              {entries.map((entry, index) => {
                const heightPct = (entry.value / maxValue) * 100;
                const date = new Date(entry.date);
                return (
                  <motion.div
                    key={entry.date}
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ duration: 0.4, delay: index * 0.05, ease: 'easeOut' }}
                    style={{ originY: 1 }}
                    className="flex flex-1 flex-col items-center gap-1.5"
                  >
                    <div className="relative flex h-32 w-full items-end justify-center">
                      <div
                        className={cn(
                          'w-full rounded-md transition-colors',
                          entry.goalMet ? 'bg-primary' : 'bg-muted',
                        )}
                        style={{ height: `${Math.max(8, heightPct)}%` }}
                        aria-label={`${date.toDateString()}: ${entry.value}`}
                      />
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {WEEK_DAY_FORMATTER.format(date)}
                    </span>
                  </motion.div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

interface StatTileProps {
  label: string;
  value: string;
  accent: 'primary' | 'success' | 'muted';
}

function StatTile({ label, value, accent }: StatTileProps): JSX.Element {
  return (
    <div
      className={cn(
        'rounded-lg border border-border p-3',
        accent === 'primary' && 'bg-primary/5',
        accent === 'success' && 'bg-success/5',
        accent === 'muted' && 'bg-card',
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function computeStreak(entries: readonly { goalMet: boolean }[]): number {
  let streak = 0;
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    if (entries[i].goalMet) streak += 1;
    else break;
  }
  return streak;
}
