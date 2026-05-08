import { Button } from "@/components/ui/button";
import { useState } from 'react';
import { Check, Flame, Trash2 } from 'lucide-react';
import { HabitWithStats } from '@/data/types';
import { formatDateRelative } from '@/utils/dateUtils';

interface HabitCardProps {
  habit: HabitWithStats;
  onToggle: (habitId: string) => void;
  onDelete: (habitId: string) => void;
}

export default function HabitCard({ habit, onToggle, onDelete }: HabitCardProps) {
  const [isAnimating, setIsAnimating] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  
  const todayLog = habit.logs.find(l => l.date === new Date().toISOString().split('T')[0]);
  const isCompletedToday = todayLog?.completed ?? false;

  const handleToggle = () => {
    setIsAnimating(true);
    onToggle(habit.id);
    setTimeout(() => setIsAnimating(false), 200);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Удалить привычку "${habit.name}"?`)) {
      onDelete(habit.id);
    }
  };

  return (
    <div 
      className="bg-card border border-border rounded-2xl shadow-sm p-4 hover:shadow-md hover:border-border/60 transition-all duration-200"
      onTouchStart={() => setShowDelete(true)}
      onMouseEnter={() => setShowDelete(true)}
      onMouseLeave={() => setShowDelete(false)}
    >
      <div className="flex items-center gap-4">
        <div 
          className="w-12 h-12 rounded-full flex items-center justify-center text-2xl shrink-0"
          style={{ backgroundColor: `${habit.color}20` }}
        >
          {habit.emoji}
        </div>
        
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground truncate">{habit.name}</h3>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex items-center gap-1 text-sm">
              <Flame size={14} className="text-orange-500" />
              <span className="font-medium text-orange-500">{habit.streak.current}</span>
              <span className="text-muted-foreground">дней</span>
            </div>
            <span className="text-muted-foreground text-sm">
              · {habit.weeklyStats.percentage}% за неделю
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {showDelete && (
            <Button
              onClick={handleDelete}
              className="p-2 rounded-full hover:bg-destructive/10 text-destructive transition-all duration-200"
            >
              <Trash2 size={18} />
            </Button>
          )}
          
          <Button
            onClick={handleToggle}
            className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
              isCompletedToday 
                ? 'bg-primary border-primary scale-100' 
                : 'border-muted-foreground/30 hover:border-primary/50 hover:scale-105'
            } ${isAnimating ? 'scale-90' : ''}`}
          >
            {isCompletedToday && (
              <Check size={20} className="text-primary-foreground animate-in zoom-in-50 duration-200" />
            )}
          </Button>
        </div>
      </div>
      
      {/* Mini progress dots */}
      <div className="flex gap-1 mt-3 ml-16">
        {habit.weeklyStats.days.map((day, i) => (
          <div
            key={i}
            className={`w-2.5 h-2.5 rounded-full transition-all duration-200 ${
              day.completed > 0 
                ? 'bg-primary' 
                : 'bg-muted-foreground/20'
            }`}
          />
        ))}
      </div>
    </div>
  );
}