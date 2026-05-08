interface MiniChartProps {
  data: { completed: number }[];
  color?: string;
}

export default function MiniChart({ data, color = '#8b5cf6' }: MiniChartProps) {
  const maxValue = Math.max(...data.map(d => d.completed), 1);
  
  return (
    <div className="flex items-end gap-1">
      {data.map((day, i) => {
        const height = (day.completed / maxValue) * 100;
        return (
          <div
            key={i}
            className="w-2 rounded-sm transition-all duration-200"
            style={{
              height: `${Math.max(height, day.completed > 0 ? 4 : 2)}px`,
              backgroundColor: day.completed > 0 ? color : '#e5e7eb',
              opacity: day.completed > 0 ? 1 : 0.3
            }}
          />
        );
      })}
    </div>
  );
}