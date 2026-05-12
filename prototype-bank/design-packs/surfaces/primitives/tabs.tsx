import React, { useState } from 'react';

interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string | number;
}

interface TabsProps {
  tabs: Tab[];
  defaultTab?: string;
  onChange?: (id: string) => void;
  variant?: 'underline' | 'pills' | 'bordered';
  children?: (activeTab: string) => React.ReactNode;
}

export function Tabs({ tabs, defaultTab, onChange, variant = 'underline', children }: TabsProps) {
  const [active, setActive] = useState(defaultTab ?? tabs[0]?.id ?? '');

  const handleSelect = (id: string) => {
    setActive(id);
    onChange?.(id);
  };

  const containerClass = variant === 'underline'
    ? 'border-b border-[--vb-border] flex gap-0'
    : variant === 'pills'
    ? 'flex gap-1 bg-[--vb-bg-alt] p-1 rounded-[--vb-radius-lg]'
    : 'flex gap-0 border border-[--vb-border] rounded-[--vb-radius-md] p-0 overflow-hidden';

  const tabClass = (id: string) => {
    const isActive = id === active;
    if (variant === 'underline') {
      return [
        'px-4 py-2.5 text-sm font-medium transition-colors duration-[--vb-duration-fast]',
        'border-b-2 -mb-px',
        isActive
          ? 'border-[--vb-accent] text-[--vb-text]'
          : 'border-transparent text-[--vb-text-muted] hover:text-[--vb-text] hover:border-[--vb-border-strong]',
      ].join(' ');
    }
    if (variant === 'pills') {
      return [
        'px-4 py-2 text-sm font-medium rounded-[--vb-radius-md] transition-all duration-[--vb-duration-fast]',
        isActive
          ? 'bg-[--vb-surface] text-[--vb-text] shadow-[--vb-shadow-sm]'
          : 'text-[--vb-text-muted] hover:text-[--vb-text]',
      ].join(' ');
    }
    return [
      'px-4 py-2 text-sm font-medium transition-colors duration-[--vb-duration-fast] border-r border-[--vb-border] last:border-0',
      isActive ? 'bg-[--vb-accent-subtle] text-[--vb-text]' : 'text-[--vb-text-muted] hover:bg-[--vb-bg-alt]',
    ].join(' ');
  };

  return (
    <div>
      <div className={containerClass} role="tablist">
        {tabs.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={tab.id === active}
            onClick={() => handleSelect(tab.id)}
            className={tabClass(tab.id)}
          >
            <span className="flex items-center gap-1.5">
              {tab.icon}
              {tab.label}
              {tab.badge !== undefined && (
                <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-[--vb-accent] text-[--vb-accent-fg]">
                  {tab.badge}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
      {children && <div className="mt-4">{children(active)}</div>}
    </div>
  );
}
