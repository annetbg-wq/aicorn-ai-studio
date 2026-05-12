import React from 'react';

interface NavSection {
  title?: string;
  items: NavItem[];
}

interface NavItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string | number;
  href?: string;
}

interface SidebarNavProps {
  sections: NavSection[];
  active: string;
  onSelect: (id: string) => void;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
  className?: string;
}

export function SidebarNav({ sections, active, onSelect, header, footer, width = 240, className = '' }: SidebarNavProps) {
  return (
    <aside
      style={{ width }}
      className={[
        'flex flex-col h-full bg-[--vb-surface] border-r border-[--vb-border]',
        'overflow-y-auto',
        className,
      ].join(' ')}
    >
      {header && <div className="px-3 py-4 border-b border-[--vb-border]">{header}</div>}
      <nav className="flex-1 px-2 py-3 space-y-4">
        {sections.map((section, si) => (
          <div key={si}>
            {section.title && (
              <p className="px-3 mb-1 text-xs font-semibold text-[--vb-text-subtle] uppercase tracking-wider">
                {section.title}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map(item => (
                <button
                  key={item.id}
                  onClick={() => onSelect(item.id)}
                  className={[
                    'w-full flex items-center gap-2.5 px-3 py-2 rounded-[--vb-radius-md]',
                    'text-sm font-medium transition-colors duration-[--vb-duration-fast]',
                    active === item.id
                      ? 'bg-[--vb-accent-subtle] text-[--vb-text]'
                      : 'text-[--vb-text-muted] hover:bg-[--vb-bg-alt] hover:text-[--vb-text]',
                  ].join(' ')}
                >
                  {item.icon && <span className="w-4 h-4 shrink-0">{item.icon}</span>}
                  <span className="flex-1 truncate text-left">{item.label}</span>
                  {item.badge !== undefined && (
                    <span className="ml-auto px-1.5 py-0.5 text-xs rounded-full bg-[--vb-accent] text-[--vb-accent-fg] font-medium">
                      {item.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </nav>
      {footer && <div className="px-3 py-4 border-t border-[--vb-border]">{footer}</div>}
    </aside>
  );
}
