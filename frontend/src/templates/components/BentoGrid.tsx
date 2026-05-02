import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface BentoItem {
  title: string;
  description: string;
  header?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function BentoGrid({
  items,
  className,
}: {
  items: BentoItem[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-4 md:grid-cols-3',
        className,
      )}
    >
      {items.map((item, i) => (
        <BentoGridItem key={i} {...item} />
      ))}
    </div>
  );
}

function BentoGridItem({ title, description, header, icon, className }: BentoItem) {
  return (
    <div
      className={cn(
        'group/bento flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md',
        className,
      )}
    >
      {header && (
        <div className="overflow-hidden rounded-lg">{header}</div>
      )}
      <div className="flex items-center gap-2">
        {icon && <span className="text-primary">{icon}</span>}
        <h3 className="font-semibold text-foreground">{title}</h3>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}
