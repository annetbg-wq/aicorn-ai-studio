import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const premiumCardVariants = cva(
  "rounded-3xl border border-[hsl(var(--pm-line))] bg-[hsl(var(--pm-surface))] text-[hsl(var(--pm-ink))]",
  {
    variants: {
      variant: {
        default: "shadow-[0_18px_50px_rgba(15,23,42,0.08)]",
        elevated: "shadow-[0_24px_80px_rgba(15,23,42,0.12)]",
        subtle: "bg-[hsl(var(--pm-surface-soft))] shadow-none",
        interactive:
          "shadow-[0_18px_50px_rgba(15,23,42,0.08)] transition-all duration-200 hover:-translate-y-1 hover:border-[hsl(var(--pm-line-strong))] hover:shadow-[0_26px_80px_rgba(15,23,42,0.13)]",
        selected:
          "border-cyan-200 bg-cyan-50/70 shadow-[0_20px_60px_rgba(14,165,233,0.12)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface PremiumCardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof premiumCardVariants> {}

const PremiumCard = React.forwardRef<HTMLDivElement, PremiumCardProps>(
  ({ className, variant, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(premiumCardVariants({ variant, className }))}
      {...props}
    />
  ),
);
PremiumCard.displayName = "PremiumCard";

const PremiumCardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("space-y-2 p-6 pb-4", className)} {...props} />
));
PremiumCardHeader.displayName = "PremiumCardHeader";

const PremiumCardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("text-lg font-semibold leading-tight tracking-normal", className)}
    {...props}
  />
));
PremiumCardTitle.displayName = "PremiumCardTitle";

const PremiumCardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm leading-6 text-[hsl(var(--pm-muted))]", className)}
    {...props}
  />
));
PremiumCardDescription.displayName = "PremiumCardDescription";

const PremiumCardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
));
PremiumCardContent.displayName = "PremiumCardContent";

const PremiumCardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex items-center gap-3 p-6 pt-0", className)} {...props} />
));
PremiumCardFooter.displayName = "PremiumCardFooter";

export {
  PremiumCard,
  PremiumCardHeader,
  PremiumCardTitle,
  PremiumCardDescription,
  PremiumCardContent,
  PremiumCardFooter,
  premiumCardVariants,
};
