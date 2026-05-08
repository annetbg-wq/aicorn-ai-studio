import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        default: 'bg-primary/10 text-primary',
        secondary: 'bg-muted text-muted-foreground',
        success: 'bg-success/10 text-success',
        warning: 'bg-warning/10 text-warning',
        rose: 'bg-rose/10 text-rose',
        violet: 'bg-violet/10 text-violet',
        outline: 'border border-border text-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps): JSX.Element {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
