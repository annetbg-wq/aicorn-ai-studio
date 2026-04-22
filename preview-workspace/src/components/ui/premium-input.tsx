import * as React from "react";

import { cn } from "@/lib/utils";

const premiumInputClass =
  "premium-focus-ring flex h-12 w-full rounded-2xl border border-[hsl(var(--pm-line))] bg-white px-4 py-3 text-sm text-[hsl(var(--pm-ink))] shadow-[0_10px_28px_rgba(15,23,42,0.05)] transition-all duration-200 placeholder:text-[hsl(var(--pm-muted-soft))] hover:border-[hsl(var(--pm-line-strong))] disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 disabled:opacity-70";

const PremiumInput = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(premiumInputClass, className)}
      {...props}
    />
  ),
);
PremiumInput.displayName = "PremiumInput";

const PremiumTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      premiumInputClass,
      "min-h-28 resize-none leading-6",
      className,
    )}
    {...props}
  />
));
PremiumTextarea.displayName = "PremiumTextarea";

interface PremiumFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: string;
  hint?: string;
  error?: string;
}

function PremiumField({
  className,
  label,
  hint,
  error,
  children,
  ...props
}: PremiumFieldProps) {
  return (
    <div className={cn("space-y-2", className)} {...props}>
      {label ? (
        <label className="text-sm font-semibold text-[hsl(var(--pm-ink))]">
          {label}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="text-sm font-medium text-rose-600">{error}</p>
      ) : hint ? (
        <p className="text-sm text-[hsl(var(--pm-muted))]">{hint}</p>
      ) : null}
    </div>
  );
}

export { PremiumField, PremiumInput, PremiumTextarea, premiumInputClass };
