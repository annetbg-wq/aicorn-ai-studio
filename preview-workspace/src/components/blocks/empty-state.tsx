import type { LucideIcon } from "lucide-react";
import { ArrowRight, SearchX } from "lucide-react";

import { PremiumButton } from "@/components/ui/premium-button";
import { cn } from "@/lib/utils";

interface PremiumEmptyStateProps {
  icon?: LucideIcon;
  title?: string;
  description?: string;
  actionLabel?: string;
  className?: string;
}

function PremiumEmptyState({
  icon: Icon = SearchX,
  title = "No matching materials",
  description = "Try a broader query or reset filters to get back to the full premium layer.",
  actionLabel = "Reset filters",
  className,
}: PremiumEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-80 flex-col items-center justify-center rounded-[2rem] border border-dashed border-[hsl(var(--pm-line-strong))] bg-white p-8 text-center shadow-[0_18px_50px_rgba(15,23,42,0.06)]",
        className,
      )}
    >
      <div className="flex size-14 items-center justify-center rounded-3xl bg-slate-100 text-slate-700">
        <Icon className="size-6" />
      </div>
      <h3 className="mt-5 text-2xl font-semibold text-[hsl(var(--pm-ink))]">
        {title}
      </h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-[hsl(var(--pm-muted))]">
        {description}
      </p>
      <PremiumButton variant="secondary" className="mt-6">
        {actionLabel}
        <ArrowRight className="size-4" />
      </PremiumButton>
    </div>
  );
}

export { PremiumEmptyState };
