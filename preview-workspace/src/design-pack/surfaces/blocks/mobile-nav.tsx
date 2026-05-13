import React from 'react';

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}

interface MobileNavProps {
  items: NavItem[];
  active: string;
  onSelect: (id: string) => void;
  className?: string;
}

export function MobileNav({ items, active, onSelect, className = '' }: MobileNavProps) {
  return (
    <nav className={[
      'fixed bottom-0 left-0 right-0 z-50',
      'bg-[--vb-surface] border-t border-[--vb-border]',
      'flex items-center justify-around',
      'pb-safe pt-2 px-2',
      'shadow-[0_-4px_20px_rgba(0,0,0,0.08)]',
      className,
    ].join(' ')}>
      {items.map(item => (
        <button
          key={item.id}
          onClick={() => onSelect(item.id)}
          className={[
            'flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-[--vb-radius-md]',
            'transition-colors duration-150 relative',
            active === item.id
              ? 'text-[--vb-accent]'
              : 'text-[--vb-text-muted] hover:text-[--vb-text]',
          ].join(' ')}
        >
          <span className="relative">
            {item.icon}
            {item.badge !== undefined && item.badge > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center text-[10px] font-bold rounded-full bg-[--vb-danger] text-[--vb-danger-fg]">
                {item.badge > 9 ? '9+' : item.badge}
              </span>
            )}
          </span>
          <span className="text-[10px] font-medium">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
