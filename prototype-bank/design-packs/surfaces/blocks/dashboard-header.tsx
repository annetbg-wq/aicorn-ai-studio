import React from 'react';

interface DashboardHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: { label: string; href?: string }[];
  actions?: React.ReactNode;
  avatar?: React.ReactNode;
  className?: string;
}

export function DashboardHeader({ title, subtitle, breadcrumbs, actions, avatar, className = '' }: DashboardHeaderProps) {
  return (
    <header className={[
      'flex items-center justify-between px-6 py-4',
      'border-b border-[--vb-border] bg-[--vb-surface]',
      className,
    ].join(' ')}>
      <div className="flex flex-col gap-0.5 min-w-0">
        {breadcrumbs && (
          <nav className="flex items-center gap-1.5 mb-1">
            {breadcrumbs.map((crumb, i) => (
              <React.Fragment key={crumb.label}>
                {i > 0 && <span className="text-[--vb-text-subtle] text-xs">/</span>}
                <span className={[
                  'text-xs',
                  i === breadcrumbs.length - 1
                    ? 'text-[--vb-text-muted]'
                    : 'text-[--vb-text-subtle] hover:text-[--vb-text-muted] cursor-pointer',
                ].join(' ')}>
                  {crumb.label}
                </span>
              </React.Fragment>
            ))}
          </nav>
        )}
        <h1 className="text-lg font-semibold text-[--vb-text] truncate">{title}</h1>
        {subtitle && <p className="text-sm text-[--vb-text-muted]">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3 ml-4 shrink-0">
        {actions}
        {avatar}
      </div>
    </header>
  );
}
