import React from 'react';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: { label: string; up: boolean };
  sparkline?: number[];
  accentColor?: string;
  className?: string;
}

function MiniSparkline({ data }: { data: number[] }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 80, h = 28;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none">
      <polyline points={points} stroke="var(--vb-accent)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MetricCard({ title, value, subtitle, trend, sparkline, accentColor, className = '' }: MetricCardProps) {
  return (
    <div
      className={[
        'bg-[--vb-surface] border border-[--vb-border] rounded-[--vb-radius-lg] p-5 shadow-[--vb-shadow-sm]',
        className
      ].join(' ')}
      style={accentColor ? { '--vb-accent': accentColor } as React.CSSProperties : undefined}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-[--vb-text-muted] uppercase tracking-wide">{title}</p>
          <p className="text-3xl font-bold text-[--vb-text] mt-1 leading-none">{value}</p>
          {subtitle && <p className="text-sm text-[--vb-text-muted] mt-1">{subtitle}</p>}
        </div>
        {sparkline && <MiniSparkline data={sparkline} />}
      </div>
      {trend && (
        <div className="mt-3 flex items-center gap-1">
          <span className={trend.up ? 'text-[--vb-success]' : 'text-[--vb-danger]'}>
            {trend.up ? '↑' : '↓'}
          </span>
          <span className="text-xs text-[--vb-text-muted]">{trend.label}</span>
        </div>
      )}
    </div>
  );
}
