import React from 'react';
import { Check, Flame } from 'lucide-react';
import { Habit } from '@/data/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { getCategories } from '@/data/habits';

interface HabitCardProps {
  habit: Habit;
  onToggle: (habitId: string, date: string) => void;
  onClick?: () => void;
}

export function HabitCard({ habit, onToggle, onClick }: HabitCardProps) {
  const categories = getCategories();
  const category = categories.find(c => c.id === habit.categoryId);
  const today = new Date().toISOString().split('T')[0];
  const isCompletedToday = habit.completedDates.includes(today);
  const progress = habit.goal > 0 ? (habit.completedDates.length / habit.goal) * 100 : 0;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle(habit.id, today);
  };

  return (
    <Card
      className="cursor-pointer transition-all hover:shadow-md active:scale-[0.98]"
      onClick={onClick}
      style={{ borderLeftColor: `hsl(${habit.color})`, borderLeftWidth: '3px' }}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {habit.icon && <span className="text-lg">{habit.icon}</span>}
              <h3 className="font-medium text-foreground truncate">{habit.name}</h3>
              {category && (
                <Badge variant="secondary" className="text-xs">
                  {category.emoji} {category.name}
                </Badge>
              )}
            </div>
            {habit.description && (
              <p className="text-sm text-muted-foreground line-clamp-1">{habit.description}</p>
            )}
            <div className="flex items-center gap-3 mt-2">
              <div className="flex items-center gap-1">
                <Flame className="w-4 h-4 text-warning" />
                <span className="text-sm font-medium">{habit.streak} дней</span>
              </div>
              <span className="text-xs text-muted-foreground">
                Цель: {habit.goal} раз(а) в день
              </span>
            </div>
            <Progress value={Math.min(progress, 100)} className="mt-2 h-1.5" />
          </div>
          <Button
            variant={isCompletedToday ? 'default' : 'outline'}
            size="icon"
            className={`ml-3 shrink-0 rounded-full w-10 h-10 ${
              isCompletedToday ? 'bg-primary text-primary-foreground' : ''
            }`}
            onClick={handleToggle}
          >
            <Check className={`w-5 h-5 ${isCompletedToday ? '' : 'text-muted-foreground'}`} />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
