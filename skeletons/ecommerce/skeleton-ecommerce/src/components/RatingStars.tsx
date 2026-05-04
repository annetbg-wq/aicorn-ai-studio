import { Star } from 'lucide-react';
import { cn } from '@/lib/cn';

interface RatingStarsProps {
  /** Rating out of 5. */
  value: number;
  size?: 'sm' | 'md';
  className?: string;
}

export function RatingStars({ value, size = 'sm', className }: RatingStarsProps): JSX.Element {
  const dim = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';
  const rounded = Math.round(value * 2) / 2;

  return (
    <div
      className={cn('inline-flex items-center gap-0.5', className)}
      role="img"
      aria-label={`Rated ${value.toFixed(1)} out of 5`}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = rounded >= n;
        const half = !filled && rounded >= n - 0.5;
        return (
          <span key={n} className="relative">
            <Star className={cn(dim, 'text-muted-foreground/40')} />
            {(filled || half) && (
              <span
                aria-hidden
                className="absolute inset-0 overflow-hidden text-warning"
                style={{ width: half ? '50%' : '100%' }}
              >
                <Star className={cn(dim, 'text-warning')} fill="currentColor" />
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}
