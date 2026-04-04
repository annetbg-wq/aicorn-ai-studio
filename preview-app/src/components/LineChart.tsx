import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartDataPoint } from '@/data/seedData';
import { formatCurrency } from '@/lib/formatters';

interface LineChartProps {
  data: ChartDataPoint[];
  title: string;
  loading?: boolean;
}

export default function LineChart({ data, title, loading }: LineChartProps) {
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
          <span className="text-4xl mb-3 opacity-20">📈</span>
          <p className="text-sm font-medium">No data for selected period</p>
        </CardContent>
      </Card>
    );
  }

  const padding = { top: 20, right: 20, bottom: 40, left: 60 };
  const width = 500;
  const height = 250;
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const values = data.map((d) => d.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;
  const niceMin = Math.floor(minVal / 10000) * 10000;
  const niceMax = Math.ceil(maxVal / 10000) * 10000;
  const niceRange = niceMax - niceMin || 1;

  const getX = (i: number) => padding.left + (i / (data.length - 1)) * innerW;
  const getY = (val: number) => padding.top + innerH - ((val - niceMin) / niceRange) * innerH;

  const linePoints = data.map((d, i) => `${getX(i)},${getY(d.value)}`).join(' ');
  const areaPoints = `${getX(0)},${height - padding.bottom} ${linePoints} ${getX(data.length - 1)},${height - padding.bottom}`;

  const yTicks = 5;
  const yTickValues = Array.from({ length: yTicks }, (_, i) =>
    niceMin + (i / (yTicks - 1)) * niceRange
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
                  y1={getY(val)}
                  x2={width - padding.right}
                  y2={getY(val)}
                  stroke="hsl(var(--border))"
                  strokeDasharray="4,4"
                />
                <text
                  x={padding.left - 10}
                  y={getY(val)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-muted-foreground"
                  fontSize="11"
                >
                  {formatCurrency(val)}
                </text>
              </g>
            ))}

            {/* X labels */}
            {data.map((d, i) => (
              <text
                key={i}
                x={getX(i)}
                y={height - padding.bottom + 20}
                textAnchor="middle"
                className="fill-muted-foreground"
                fontSize="11"
              >
                {d.date}
              </text>
            ))}

            {/* Area fill */}
            <defs>
              <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.2" />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
              </linearGradient>
            </defs>
            <polygon points={areaPoints} fill="url(#lineGrad)" />

            {/* Line */}
            <polyline
              points={linePoints}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Hover targets & dots */}
            {data.map((d, i) => (
              <g key={i}>
                <rect
                  x={getX(i) - 20}
                  y={padding.top}
                  width={40}
                  height={innerH}
                  fill="transparent"
                  onMouseEnter={() => setHoveredIndex(i)}
                />
                <circle
                  cx={getX(i)}
                  cy={getY(d.value)}
                  r={hoveredIndex === i ? 5 : 3}
                  fill="hsl(var(--primary))"
                  stroke="hsl(var(--background))"
                  strokeWidth="2"
                  className="transition-all duration-150"
                />
              </g>
            ))}
          </svg>

          {/* Tooltip */}
          {hoveredIndex !== null && (
            <div
              className="absolute pointer-events-none bg-popover border border-border rounded-lg px-3 py-2 shadow-lg text-sm z-10"
              style={{
                left: `${(getX(hoveredIndex) / width) * 100}%`,
                top: getY(data[hoveredIndex].value) - 50,
                transform: 'translateX(-50%)',
              }}
            >
              <p className="font-semibold text-foreground">
                {formatCurrency(data[hoveredIndex].value)}
              </p>
              <p className="text-xs text-muted-foreground">{data[hoveredIndex].date}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}