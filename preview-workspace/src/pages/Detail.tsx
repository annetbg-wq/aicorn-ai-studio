import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useHabits } from '@/hooks/useHabits';
import { WeeklyChart } from '@/components/WeeklyChart';
import { StreakBadge } from '@/components/StreakBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { ArrowLeft, Trash2, Calendar, Flame, Target } from 'lucide-react';
import { getCategories } from '@/data/habits';

export default function Detail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { habits, deleteHabit, getWeeklyStats } = useHabits();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const habit = habits.find(h => h.id === id);
  const categories = getCategories();
  const category = habit ? categories.find(c => c.id === habit.categoryId) : null;
  const weeklyStats = getWeeklyStats();

  if (!habit) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold">Привычка не найдена</h1>
        </div>
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">Эта привычка была удалена или не существует</p>
            <Button className="mt-4" onClick={() => navigate('/')}>
              Вернуться на главную
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleDelete = () => {
    deleteHabit(habit.id);
    navigate('/', { replace: true });
  };

  const completedThisWeek = weeklyStats.filter(s => {
    const date = new Date(s.date);
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    return date >= weekAgo && habit.completedDates.includes(s.date);
  }).length;

  return (
    <div className="pb-20">
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-xl font-bold text-foreground">Детали привычки</h1>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="w-5 h-5" />
          </Button>
        </div>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              {habit.icon && <span className="text-3xl">{habit.icon}</span>}
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-foreground">{habit.name}</h2>
                {category && (
                  <Badge variant="secondary" className="mt-1">
                    {category.emoji} {category.name}
                  </Badge>
                )}
              </div>
            </div>

            {habit.description && (
              <p className="text-muted-foreground mt-4">{habit.description}</p>
            )}

            <div className="grid grid-cols-3 gap-4 mt-6">
              <div className="text-center p-3 rounded-lg bg-muted">
                <Flame className="w-5 h-5 mx-auto mb-1 text-warning" />
                <div className="text-lg font-bold">{habit.streak}</div>
                <div className="text-xs text-muted-foreground">дней подряд</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted">
                <Target className="w-5 h-5 mx-auto mb-1 text-primary" />
                <div className="text-lg font-bold">{habit.goal}</div>
                <div className="text-xs text-muted-foreground">цель в день</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted">
                <Calendar className="w-5 h-5 mx-auto mb-1 text-accent" />
                <div className="text-lg font-bold">{completedThisWeek}</div>
                <div className="text-xs text-muted-foreground">за неделю</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Прогресс за неделю</CardTitle>
          </CardHeader>
          <CardContent>
            <WeeklyChart data={weeklyStats} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">История выполнения</CardTitle>
          </CardHeader>
          <CardContent>
            {habit.completedDates.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                Пока нет выполненных дней
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {habit.completedDates.slice().reverse().slice(0, 30).map(date => {
                  const d = new Date(date);
                  return (
                    <Badge key={date} variant="secondary" className="text-xs">
                      {d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                    </Badge>
                  );
                })}
                {habit.completedDates.length > 30 && (
                  <Badge variant="outline" className="text-xs">
                    +{habit.completedDates.length - 30} ещё
                  </Badge>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить привычку?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите удалить "{habit.name}"? Это действие нельзя отменить.
              Вся история выполнения будет потеряна.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
