import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const premiumButtonVariants = cva(
  "premium-focus-ring inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-semibold tracking-normal transition-all duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-[hsl(var(--pm-ink))] text-white shadow-[0_14px_34px_rgba(15,23,42,0.18)] hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-[0_18px_44px_rgba(15,23,42,0.22)]",
        brand:
          "bg-[hsl(var(--pm-brand))] text-white shadow-[0_14px_34px_rgba(14,165,233,0.22)] hover:-translate-y-0.5 hover:bg-cyan-600 hover:shadow-[0_18px_44px_rgba(14,165,233,0.26)]",
        secondary:
          "bg-white text-[hsl(var(--pm-ink))] ring-1 ring-[hsl(var(--pm-line))] shadow-[0_10px_28px_rgba(15,23,42,0.07)] hover:-translate-y-0.5 hover:bg-slate-50 hover:ring-[hsl(var(--pm-line-strong))]",
        outline:
          "bg-transparent text-[hsl(var(--pm-ink))] ring-1 ring-[hsl(var(--pm-line-strong))] hover:bg-white hover:shadow-[0_12px_32px_rgba(15,23,42,0.08)]",
        ghost:
          "bg-transparent text-[hsl(var(--pm-muted))] hover:bg-white/80 hover:text-[hsl(var(--pm-ink))]",
        quiet:
          "bg-[hsl(var(--pm-surface-soft))] text-[hsl(var(--pm-ink))] hover:bg-white hover:shadow-[0_12px_28px_rgba(15,23,42,0.07)]",
        destructive:
          "bg-rose-600 text-white shadow-[0_14px_34px_rgba(225,29,72,0.2)] hover:-translate-y-0.5 hover:bg-rose-700",
      },
      size: {
        sm: "h-9 px-3.5",
        default: "h-11 px-5",
        lg: "h-[3.25rem] px-6 text-base",
        icon: "size-11 p-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export interface PremiumButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof premiumButtonVariants> {
  asChild?: boolean;
}

const PremiumButton = React.forwardRef<HTMLButtonElement, PremiumButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        ref={ref}
        className={cn(premiumButtonVariants({ variant, size, className }))}
        {...props}
      />
    );
  },
);
PremiumButton.displayName = "PremiumButton";

export { PremiumButton, premiumButtonVariants };
