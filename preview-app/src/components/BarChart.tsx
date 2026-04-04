import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartDataPoint } from '@/data/seedData';
import { formatNumber } from '@/lib/formatters';

interface BarChartProps {
  data: ChartDataPoint[];
  title: string;
  loading?: boolean;
}

export default function BarChart({ data, title, loading }: BarChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (loading) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[250px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-foreground">{title}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center h-[250px] text-muted-foreground">
          <span className="text-4xl mb-3 opacity-20">📊</span>
          <p className="text-sm font-medium">No data for selected period</p>
        </CardContent>
      </Card>
    );
  }

  const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  const width = 500;
  const height = 250;
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const values = data.map((d) => d.value);
  const maxVal = Math.max(...values);
  const niceMax = Math.ceil(maxVal / 50) * 50 || 100;

  const barWidth = (innerW / data.length) * 0.6;
  const barGap = (innerW / data.length) * 0.4;

  const getX = (i: number) => padding.left + i * (innerW / data.length) + barGap / 2;
  const getBarHeight = (val: number) => (val / niceMax) * innerH;

  const yTicks = 5;
  const yTickValues = Array.from({ length: yTicks }, (_, i) =>
    Math.round((i / (yTicks - 1)) * niceMax)
  );

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full"
            style={{ height: 250 }}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            {/* Grid lines */}
            {yTickValues.map((val, i) => (
              <g key={i}>
                <line
                  x1={padding.left}
                  y1={padding.top + innerH - getBarHeight(val)}
                  x2={width - padding.right}
                  y2={padding.top + innerH - getBarHeight(val)}
                  stroke="hsl(var(--border))"
                  strokeDasharray="4,4"
                />
                <text
                  x={padding.left - 8}
                  y={padding.top + innerH - getBarHeight(val)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-muted-foreground"
                  fontSize="11"
                >
                  {formatNumber(val)}
                </text>
              </g>
            ))}

            {/* Bars */}
            {data.map((d, i) => {
              const barH = getBarHeight(d.value);
              const isHovered = hoveredIndex === i;
              return (
                <g key={i}>
                  <rect
                    x={getX(i)}
                    y={padding.top + innerH - barH}
                    width={barWidth}
                    height={barH}
                    rx={4}
                    fill={isHovered ? 'hsl(var(--primary))' : 'hsl(var(--primary) / 0.7)'}
                    className="transition-all duration-150 cursor-pointer"
                    onMouseEnter={() => setHoveredIndex(i)}
                  />
                  <text
                    x={getX(i) + barWidth / 2}
                    y={height - padding.bottom + 20}
                    textAnchor="middle"
                    className="fill-muted-foreground"
                    fontSize="11"
                  >
                    {d.date}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Tooltip */}
          {hoveredIndex !== null && (
            <div
              className="absolute pointer-events-none bg-popover border border-border rounded-lg px-3 py-2 shadow-lg text-sm z-10"
              style={{
                left: `${(getX(hoveredIndex) + barWidth / 2) / width * 100}%`,
                top: padding.top + innerH - getBarHeight(data[hoveredIndex].value) - 50,
                transform: 'translateX(-50%)',
              }}
            >
              <p className="font-semibold text-foreground">
                {formatNumber(data[hoveredIndex].value)} sign-ups
              </p>
              <p className="text-xs text-muted-foreground">{data[hoveredIndex].date}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}