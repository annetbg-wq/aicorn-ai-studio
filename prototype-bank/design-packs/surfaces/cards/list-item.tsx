import React from 'react';

interface ListItemProps {
  title: string;
  subtitle?: string;
  meta?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  onClick?: () => void;
  selected?: boolean;
  disabled?: boolean;
  className?: string;
}

export function ListItem({ title, subtitle, meta, leading, trailing, onClick, selected, disabled, className = '' }: ListItemProps) {
  return (
    <div
      onClick={disabled ? undefined : onClick}
      role={onClick ? 'button' : undefined}
      className={[
        'flex items-center gap-3 px-3 py-2.5 rounded-[--vb-radius-md]',
        'transition-colors duration-[--vb-duration-fast]',
        selected ? 'bg-[--vb-accent-subtle]' : '',
        onClick && !disabled ? 'cursor-pointer hover:bg-[--vb-bg-alt]' : '',
        disabled ? 'opacity-50 cursor-not-allowed' : '',
        className,
      ].join(' ')}
    >
      {leading && <div className="shrink-0">{leading}</div>}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[--vb-text] truncate">{title}</p>
        {subtitle && <p className="text-xs text-[--vb-text-muted] truncate mt-0.5">{subtitle}</p>}
      </div>
      {meta && <span className="text-xs text-[--vb-text-subtle] shrink-0">{meta}</span>}
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  );
}
