import React from 'react';
import { useHabits } from '@/hooks/useHabits';
import { WeeklyChart } from '@/components/WeeklyChart';
import { StreakBadge } from '@/components/StreakBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3, Flame, Target, Trophy } from 'lucide-react';

export default function Progress() {
  const { habits, loading, getWeeklyStats } = useHabits();
  const weeklyStats = getWeeklyStats();

  const activeHabits = habits.filter(h => {
    const created = new Date(h.createdAt);
    const today = new Date();
    created.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    return created <= today;
  });

  const bestStreak = Math.max(...habits.map(h => h.streak), 0);
  const totalCompletionsThisWeek = weeklyStats.reduce((sum, day) => sum + day.count, 0);

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <Skeleton className="h-48 w-full rounded-xl" />
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="pb-20">
      <div className="p-4 space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Мой прогресс</h1>

        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <Target className="w-5 h-5 mx-auto mb-1 text-primary" />
              <div className="text-xl font-bold">{activeHabits.length}</div>
              <div className="text-xs text-muted-foreground">привычек</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Flame className="w-5 h-5 mx-auto mb-1 text-warning" />
              <div className="text-xl font-bold">{bestStreak}</div>
              <div className="text-xs text-muted-foreground">лучшая серия</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Trophy className="w-5 h-5 mx-auto mb-1 text-accent" />
              <div className="text-xl font-bold">{totalCompletionsThisWeek}</div>
              <div className="text-xs text-muted-foreground">за неделю</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              Недельная статистика
            </CardTitle>
          </CardHeader>
          <CardContent>
            <WeeklyChart data={weeklyStats} />
          </CardContent>
        </Card>

        <div>
          <h2 className="text-lg font-semibold text-foreground mb-3">
            Все привычки
          </h2>
          {habits.length === 0 ? (
            <EmptyState
              icon={<Target className="w-12 h-12" />}
              title="Нет привычек"
              description="Создайте привычку, чтобы начать отслеживать прогресс"
            />
          ) : (
            <div className="space-y-2">
              {habits
                .sort((a, b) => b.streak - a.streak)
                .map(habit => (
                  <Card key={habit.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {habit.icon && <span className="text-xl">{habit.icon}</span>}
                          <div>
                            <p className="font-medium text-foreground">{habit.name}</p>
                            <p className="text-xs text-muted-foreground">
                              Выполнено: {habit.completedDates.length} дней
                            </p>
                          </div>
                        </div>
                        <StreakBadge streak={habit.streak} />
                      </div>
                    </CardContent>
                  </Card>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
