import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react';
import { Card, CardContent } from './ui/Card';
import { cn } from '@/lib/cn';
import type { KPIMetric } from '@/data/types';

interface KPICardProps {
  metric: KPIMetric;
}

export function KPICard({ metric }: KPICardProps): JSX.Element {
  const tone =
    metric.trend === 'up' ? 'text-success' : metric.trend === 'down' ? 'text-rose' : 'text-muted-foreground';
  const Icon = metric.trend === 'up' ? ArrowUp : metric.trend === 'down' ? ArrowDown : ArrowRight;
  const sign = metric.deltaPct > 0 ? '+' : '';

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-4">
        <p className="text-xs font-medium text-muted-foreground">{metric.label}</p>
        <p className="text-2xl font-semibold tracking-tight">{metric.value}</p>
        <div className={cn('flex items-center gap-1 text-xs font-medium', tone)}>
          <Icon className="h-3 w-3" />
          <span>
            {sign}
            {metric.deltaPct.toFixed(1)}%
          </span>
          <span className="text-muted-foreground">vs last week</span>
        </div>
      </CardContent>
    </Card>
  );
}
