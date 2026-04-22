import { ArrowRight, ShieldCheck } from "lucide-react";

import { PremiumButton } from "@/components/ui/premium-button";
import { cn } from "@/lib/utils";

interface PremiumCtaBlockProps {
  title?: string;
  description?: string;
  primaryAction?: string;
  secondaryAction?: string;
  className?: string;
}

function PremiumCtaBlock({
  title = "Build the next screen from materials, not memory.",
  description = "Use the normalized layer for cards, empty states, search, filters, shell layout, and product-grade calls to action.",
  primaryAction = "Use premium layer",
  secondaryAction = "Read guidelines",
  className,
}: PremiumCtaBlockProps) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-[2rem] bg-[hsl(var(--pm-ink))] p-6 text-white shadow-[0_28px_90px_rgba(15,23,42,0.2)] sm:p-8 lg:p-10",
        className,
      )}
    >
      <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="max-w-3xl space-y-4">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-white/10 text-cyan-200">
            <ShieldCheck className="size-5" />
          </div>
          <h2 className="text-3xl font-semibold leading-tight tracking-normal sm:text-4xl">
            {title}
          </h2>
          <p className="text-base leading-7 text-white/70">{description}</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
          <PremiumButton variant="brand" size="lg">
            {primaryAction}
            <ArrowRight className="size-5" />
          </PremiumButton>
          <PremiumButton
            variant="ghost"
            size="lg"
            className="text-white hover:bg-white/10 hover:text-white"
          >
            {secondaryAction}
          </PremiumButton>
        </div>
      </div>
    </section>
  );
}

export { PremiumCtaBlock };
