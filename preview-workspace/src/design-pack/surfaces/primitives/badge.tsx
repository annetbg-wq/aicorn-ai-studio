import React from 'react';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'outline';
type BadgeSize = 'sm' | 'md';

interface BadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-[--vb-accent-subtle] text-[--vb-text]',
  success: 'bg-[--vb-success-subtle] text-[--vb-success]',
  warning: 'bg-[--vb-warning-subtle] text-[--vb-warning]',
  danger:  'bg-[--vb-danger-subtle] text-[--vb-danger]',
  info:    'bg-[--vb-info-subtle] text-[--vb-info]',
  outline: 'bg-transparent border border-[--vb-border-strong] text-[--vb-text-muted]',
};

const dotColors: Record<BadgeVariant, string> = {
  default: 'bg-[--vb-accent]',
  success: 'bg-[--vb-success]',
  warning: 'bg-[--vb-warning]',
  danger:  'bg-[--vb-danger]',
  info:    'bg-[--vb-info]',
  outline: 'bg-[--vb-text-muted]',
};

export function Badge({ variant = 'default', size = 'md', dot = false, children, className = '' }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 font-medium rounded-[--vb-radius-full]',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs',
        variantStyles[variant],
        className,
      ].join(' ')}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]}`} />}
      {children}
    </span>
  );
}
