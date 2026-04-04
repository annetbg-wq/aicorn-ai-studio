import { TrendingUp, TrendingDown, DollarSign, Users, UserPlus, Activity } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { KPI } from '@/data/seedData';
import { formatKPIValue } from '@/lib/formatters';

interface KPICardProps {
  kpi: KPI;
  loading?: boolean;
}

const iconMap: Record<string, React.ElementType> = {
  DollarSign,
  Users,
  UserPlus,
  TrendingUp,
  Activity,
};

export default function KPICard({ kpi, loading }: KPICardProps) {
  if (loading) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-5">
          <Skeleton className="h-4 w-24 mb-3" />
          <Skeleton className="h-8 w-32 mb-3" />
          <Skeleton className="h-4 w-20 mb-4" />
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
    );
  }

  const Icon = iconMap[kpi.icon] || Activity;
  const isPositive = kpi.changePercent >= 0;

  return (
    <Card className="bg-card border-border hover:shadow-lg hover:shadow-primary/5 transition-all duration-200 hover:-translate-y-0.5">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-muted-foreground">{kpi.title}</span>
          <div className="h-9 w-9 rounded-lg bg-muted/50 flex items-center justify-center">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>

        <div className="text-2xl font-bold text-foreground mb-2">
          {formatKPIValue(kpi.value, kpi.format)}
        </div>

        <div className="flex items-center gap-1.5 mb-4">
          {isPositive ? (
            <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <TrendingDown className="h-3.5 w-3.5 text-red-500" />
          )}
          <span className={`text-sm font-medium ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
            {isPositive ? '+' : ''}{kpi.changePercent}%
          </span>
          <span className="text-xs text-muted-foreground">vs last period</span>
        </div>

        {/* Mini sparkline */}
        <MiniSparkline data={kpi.trendData} positive={isPositive} />
      </CardContent>
    </Card>
  );
}

function MiniSparkline({ data, positive }: { data: number[]; positive: boolean }) {
  const width = 100;
  const height = 32;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((val - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  const areaPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-8" preserveAspectRatio="none">
      <defs>
        <linearGradient id={positive ? 'sparkGreen' : 'sparkRed'} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={positive ? '#10b981' : '#ef4444'} stopOpacity="0.3" />
          <stop offset="100%" stopColor={positive ? '#10b981' : '#ef4444'} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={areaPoints}
        fill={`url(#${positive ? 'sparkGreen' : 'sparkRed'})`}
      />
      <polyline
        points={points}
        fill="none"
        stroke={positive ? '#10b981' : '#ef4444'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}