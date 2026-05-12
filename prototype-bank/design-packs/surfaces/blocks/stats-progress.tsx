import React from 'react';

interface ProgressBarProps {
  label: string;
  value: number;
  max?: number;
  color?: string;
  showPercent?: boolean;
}

interface StatsProgressProps {
  title: string;
  items: ProgressBarProps[];
  className?: string;
}

export function ProgressBar({ label, value, max = 100, color, showPercent = true }: ProgressBarProps) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-[--vb-text]">{label}</span>
        {showPercent && <span className="text-xs font-medium text-[--vb-text-muted]">{Math.round(pct)}%</span>}
      </div>
      <div className="h-2 bg-[--vb-border] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-[--vb-duration-slow]"
          style={{ width: `${pct}%`, background: color ?? 'var(--vb-accent)' }}
        />
      </div>
    </div>
  );
}

export function StatsProgress({ title, items, className = '' }: StatsProgressProps) {
  return (
    <div className={[
      'bg-[--vb-surface] border border-[--vb-border] rounded-[--vb-radius-lg] p-5 shadow-[--vb-shadow-sm]',
      className,
    ].join(' ')}>
      <h3 className="text-sm font-semibold text-[--vb-text] mb-4">{title}</h3>
      <div className="space-y-4">
        {items.map(item => <ProgressBar key={item.label} {...item} />)}
      </div>
    </div>
  );
}
