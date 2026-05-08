import { ReactNode } from 'react';

interface StatsCardProps {
  icon: ReactNode;
  label: string;
  value: string | number;
  trend?: string;
  trendUp?: boolean;
}

export default function StatsCard({ icon, label, value, trend, trendUp }: StatsCardProps) {
  return (
    <div className="bg-card rounded-2xl p-4 border border-border shadow-sm hover:shadow-md transition-all duration-200">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          {icon}
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold text-foreground mt-0.5">{value}</p>
          {trend && (
            <p className={`text-xs mt-0.5 ${trendUp ? 'text-emerald-500' : 'text-rose-500'}`}>
              {trend}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}