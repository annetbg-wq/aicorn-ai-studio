import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface ScrollAreaProps extends ComponentPropsWithoutRef<'div'> {
  children?: ReactNode;
}

export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn('relative overflow-hidden', className)} {...props}>
      <div className="h-full w-full overflow-auto rounded-[inherit]">
        {children}
      </div>
    </div>
  ),
);
ScrollArea.displayName = 'ScrollArea';

export interface ScrollBarProps extends ComponentPropsWithoutRef<'div'> {
  orientation?: 'vertical' | 'horizontal';
}

export const ScrollBar = forwardRef<HTMLDivElement, ScrollBarProps>(
  ({ className, orientation = 'vertical', ...props }, ref) => (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute select-none rounded-full bg-border/60',
        orientation === 'vertical'
          ? 'bottom-1 right-1 top-1 w-1.5'
          : 'bottom-1 left-1 right-1 h-1.5',
        className,
      )}
      {...props}
    />
  ),
);
ScrollBar.displayName = 'ScrollBar';
