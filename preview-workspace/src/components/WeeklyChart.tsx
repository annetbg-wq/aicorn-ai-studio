import React from 'react';
import { WeeklyStats } from '@/data/types';

interface WeeklyChartProps {
  data: WeeklyStats[];
  maxHeight?: number;
}

export function WeeklyChart({ data, maxHeight = 120 }: WeeklyChartProps) {
  const maxCount = Math.max(...data.map(d => d.count), 1);

  return (
    <div className="flex items-end justify-between gap-2 pt-4 pb-2">
      {data.map((day) => {
        const height = (day.count / maxCount) * maxHeight;
        return (
          <div key={day.date} className="flex flex-col items-center gap-1 flex-1">
            <span className="text-xs text-muted-foreground font-medium">{day.day}</span>
            <div
              className="w-full rounded-md transition-all duration-300 bg-primary/20"
              style={{
                height: `${Math.max(height, 4)}px`,
                backgroundColor: day.count > 0 ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
                opacity: day.count > 0 ? 0.7 + (day.count / maxCount) * 0.3 : 0.3,
              }}
            />
            <span className="text-xs font-medium text-foreground">{day.count}</span>
          </div>
        );
      })}
    </div>
  );
}
