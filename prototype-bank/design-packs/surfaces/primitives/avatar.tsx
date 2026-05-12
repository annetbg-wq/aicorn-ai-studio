import React from 'react';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface AvatarProps {
  src?: string;
  name?: string;
  size?: AvatarSize;
  className?: string;
  status?: 'online' | 'offline' | 'busy';
}

const sizeMap: Record<AvatarSize, { container: string; text: string; status: string }> = {
  xs: { container: 'w-6 h-6',    text: 'text-xs',   status: 'w-1.5 h-1.5' },
  sm: { container: 'w-8 h-8',    text: 'text-xs',   status: 'w-2 h-2' },
  md: { container: 'w-10 h-10',  text: 'text-sm',   status: 'w-2.5 h-2.5' },
  lg: { container: 'w-12 h-12',  text: 'text-base', status: 'w-3 h-3' },
  xl: { container: 'w-16 h-16',  text: 'text-xl',   status: 'w-3.5 h-3.5' },
};

const statusColors = {
  online:  'bg-[--vb-success]',
  offline: 'bg-[--vb-text-subtle]',
  busy:    'bg-[--vb-danger]',
};

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
}

function getColorFromName(name: string): string {
  const colors = ['#6366f1','#8b5cf6','#ec4899','#f97316','#10b981','#0d9488','#2563eb','#d97706'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export function Avatar({ src, name = '', size = 'md', status, className = '' }: AvatarProps) {
  const s = sizeMap[size];
  return (
    <div className={`relative inline-flex shrink-0 ${className}`}>
      <div
        className={[
          s.container, s.text,
          'rounded-[--vb-radius-full] overflow-hidden flex items-center justify-center font-semibold text-white',
        ].join(' ')}
        style={{ background: src ? undefined : getColorFromName(name) }}
      >
        {src
          ? <img src={src} alt={name} className="w-full h-full object-cover" />
          : <span>{getInitials(name) || '?'}</span>
        }
      </div>
      {status && (
        <span
          className={[
            'absolute bottom-0 right-0 rounded-full border-2 border-[--vb-surface]',
            s.status, statusColors[status],
          ].join(' ')}
        />
      )}
    </div>
  );
}
