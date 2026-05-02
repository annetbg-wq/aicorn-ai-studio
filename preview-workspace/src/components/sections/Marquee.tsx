'use client';
import { type ReactNode, useRef } from 'react';
import { cn } from '@/lib/utils';

interface MarqueeProps {
  children?: ReactNode;
  items?: string[];
  className?: string;
  /** Reverse scroll direction */
  reverse?: boolean;
  /** Pause animation on hover */
  pauseOnHover?: boolean;
  /** Scroll vertically instead of horizontally */
  vertical?: boolean;
  /** How many times to duplicate children for seamless loop */
  repeat?: number;
  /** Animation duration in seconds */
  duration?: number;
}

export function Marquee({
  children,
  items = [],
  className,
  reverse = false,
  pauseOnHover = false,
  vertical = false,
  repeat = 4,
  duration = 40,
}: MarqueeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hasChildren = children !== undefined && children !== null;
  const resolvedChildren = hasChildren
    ? children
    : items.map((item, index) => (
        <span
          key={`${item}-${index}`}
          className="rounded-full border border-border bg-card px-4 py-2 text-sm text-foreground shadow-sm"
        >
          {item}
        </span>
      ));

  const animationName = vertical
    ? reverse ? 'marquee-vertical-reverse' : 'marquee-vertical'
    : reverse ? 'marquee-horizontal-reverse' : 'marquee-horizontal';

  return (
    <>
      <style>{`
        @keyframes marquee-horizontal        { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes marquee-horizontal-reverse{ from { transform: translateX(-50%); } to { transform: translateX(0); } }
        @keyframes marquee-vertical          { from { transform: translateY(0); } to { transform: translateY(-50%); } }
        @keyframes marquee-vertical-reverse  { from { transform: translateY(-50%); } to { transform: translateY(0); } }
      `}</style>
      <div
        ref={containerRef}
        className={cn(
          'group flex overflow-hidden',
          vertical ? 'flex-col' : 'flex-row',
          className,
        )}
      >
        {Array.from({ length: repeat }).map((_, i) => (
          <div
            key={i}
            className={cn('flex shrink-0 gap-4', vertical ? 'flex-col' : 'flex-row')}
            style={{
              animation: `${animationName} ${duration}s linear infinite`,
              animationPlayState: pauseOnHover ? 'var(--play-state, running)' : 'running',
            }}
            onMouseEnter={(e) =>
              pauseOnHover &&
              (e.currentTarget.style.setProperty('--play-state', 'paused'))
            }
            onMouseLeave={(e) =>
              pauseOnHover &&
              (e.currentTarget.style.setProperty('--play-state', 'running'))
            }
          >
            {resolvedChildren}
          </div>
        ))}
      </div>
    </>
  );
}
