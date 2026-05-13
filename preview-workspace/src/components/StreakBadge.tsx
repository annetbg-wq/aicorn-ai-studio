import React from 'react';
import { Flame } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface StreakBadgeProps {
  streak: number;
}

export function StreakBadge({ streak }: StreakBadgeProps) {
  if (streak === 0) return null;

  const isLongStreak = streak >= 7;

  return (
    <Badge
      variant="secondary"
      className={`flex items-center gap-1 px-2 py-0.5 text-xs font-medium ${
        isLongStreak
          ? 'bg-destructive/10 text-destructive border-destructive/20'
          : 'bg-warning/10 text-warning border-warning/20'
      }`}
    >
      <Flame className={`w-3.5 h-3.5 ${isLongStreak ? 'text-destructive' : 'text-warning'}`} />
      <span>{streak}</span>
    </Badge>
  );
}
