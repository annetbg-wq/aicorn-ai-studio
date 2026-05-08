import { getDayName } from '@/utils/dateUtils';

interface BarChartProps {
  data: { date: string; completed: number; total: number }[];
  height?: number;
  color?: string;
}

export default function BarChart({ data, height = 120, color = '#8b5cf6' }: BarChartProps) {
  const maxValue = Math.max(...data.map(d => d.completed), 1);
  
  return (
    <div className="flex items-end gap-1.5" style={{ height }}>
      {data.map((day, i) => {
        const barHeight = (day.completed / maxValue) * 100;
        const isToday = i === data.length - 1;
        
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
            <div 
              className="w-full rounded-t-md transition-all duration-300 hover:opacity-80 min-h-[4px]"
              style={{ 
                height: `${Math.max(barHeight, day.completed > 0 ? 8 : 4)}%`,
                backgroundColor: day.completed > 0 ? color : '#e5e7eb',
                opacity: day.completed > 0 ? 1 : 0.3
              }}
            />
            <span className={`text-[10px] ${isToday ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
              {getDayName(day.date)}
            </span>
          </div>
        );
      })}
    </div>
  );
}