import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  change?: { value: string; positive: boolean };
  icon?: React.ReactNode;
  chart?: React.ReactNode;
  className?: string;
}

export function StatCard({ label, value, change, icon, chart, className = '' }: StatCardProps) {
  return (
    <div className={[
      'bg-[--vb-surface] border border-[--vb-border] rounded-[--vb-radius-lg] p-5',
      'flex flex-col gap-3 shadow-[--vb-shadow-sm]',
      className
    ].join(' ')}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[--vb-text-muted]">{label}</span>
        {icon && (
          <span className="w-9 h-9 rounded-[--vb-radius-md] bg-[--vb-accent-subtle] flex items-center justify-center text-[--vb-accent]">
            {icon}
          </span>
        )}
      </div>
      <div className="flex items-end justify-between">
        <span className="text-2xl font-bold text-[--vb-text] leading-none">{value}</span>
        {change && (
          <span className={[
            'text-xs font-medium px-2 py-0.5 rounded-full',
            change.positive
              ? 'bg-[--vb-success-subtle] text-[--vb-success]'
              : 'bg-[--vb-danger-subtle] text-[--vb-danger]',
          ].join(' ')}>
            {change.positive ? '↑' : '↓'} {change.value}
          </span>
        )}
      </div>
      {chart && <div className="mt-1">{chart}</div>}
    </div>
  );
}
