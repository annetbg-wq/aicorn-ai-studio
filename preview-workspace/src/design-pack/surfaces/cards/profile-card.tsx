import React from 'react';

interface ProfileCardProps {
  name: string;
  role?: string;
  avatar?: string;
  stats?: { label: string; value: string | number }[];
  actions?: React.ReactNode;
  badge?: string;
  className?: string;
}

export function ProfileCard({ name, role, avatar, stats, actions, badge, className = '' }: ProfileCardProps) {
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className={[
      'bg-[--vb-surface] border border-[--vb-border] rounded-[--vb-radius-lg] overflow-hidden shadow-[--vb-shadow-sm]',
      className
    ].join(' ')}>
      <div className="h-20 bg-gradient-to-br from-[--vb-accent] to-[--vb-accent-hover] opacity-80" />
      <div className="px-5 pb-5 -mt-8">
        <div className="flex items-end justify-between mb-3">
          <div className="w-14 h-14 rounded-[--vb-radius-full] border-3 border-[--vb-surface] bg-[--vb-accent] flex items-center justify-center text-[--vb-accent-fg] font-bold text-lg overflow-hidden shadow-[--vb-shadow-sm]">
            {avatar ? <img src={avatar} alt={name} className="w-full h-full object-cover" /> : initials}
          </div>
          {badge && (
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-[--vb-accent-subtle] text-[--vb-accent] mb-1">
              {badge}
            </span>
          )}
        </div>
        <h3 className="text-base font-semibold text-[--vb-text]">{name}</h3>
        {role && <p className="text-sm text-[--vb-text-muted] mt-0.5">{role}</p>}
        {stats && stats.length > 0 && (
          <div className="flex gap-4 mt-4 pt-4 border-t border-[--vb-border]">
            {stats.map(s => (
              <div key={s.label} className="flex flex-col items-center">
                <span className="text-base font-bold text-[--vb-text]">{s.value}</span>
                <span className="text-xs text-[--vb-text-muted]">{s.label}</span>
              </div>
            ))}
          </div>
        )}
        {actions && <div className="mt-4">{actions}</div>}
      </div>
    </div>
  );
}
