import { ArrowRight, CheckCircle2 } from "lucide-react";

import { PremiumButton } from "@/components/ui/premium-button";
import { PremiumCard, PremiumCardContent } from "@/components/ui/premium-card";
import { PremiumChip } from "@/components/ui/premium-chip";
import { PremiumSkeleton } from "@/components/ui/premium-skeleton";

function PremiumInteractionStates() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <PremiumCard variant="default">
        <PremiumCardContent className="space-y-4 p-5">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-[hsl(var(--pm-muted))]">
            Normal
          </p>
          <PremiumButton variant="secondary" className="w-full">
            Secondary action
          </PremiumButton>
          <PremiumChip>Open</PremiumChip>
        </PremiumCardContent>
      </PremiumCard>
      <PremiumCard variant="elevated" className="-translate-y-1 border-[hsl(var(--pm-line-strong))]">
        <PremiumCardContent className="space-y-4 p-5">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-cyan-700">
            Hover
          </p>
          <PremiumButton variant="secondary" className="w-full -translate-y-0.5 shadow-[0_14px_34px_rgba(15,23,42,0.1)]">
            Hovered action
            <ArrowRight className="size-4" />
          </PremiumButton>
          <PremiumChip className="-translate-y-0.5 border-[hsl(var(--pm-line-strong))] shadow-[0_14px_34px_rgba(15,23,42,0.1)]">
            Hovered
          </PremiumChip>
        </PremiumCardContent>
      </PremiumCard>
      <PremiumCard variant="selected">
        <PremiumCardContent className="space-y-4 p-5">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-cyan-700">
            Active
          </p>
          <PremiumButton variant="brand" className="w-full scale-[0.98]">
            Confirmed
            <CheckCircle2 className="size-4" />
          </PremiumButton>
          <PremiumChip selected>Selected</PremiumChip>
        </PremiumCardContent>
      </PremiumCard>
    </div>
  );
}

function PremiumSkeletonStrip() {
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      <PremiumSkeleton className="h-12" />
      <PremiumSkeleton className="h-12" />
      <PremiumSkeleton className="h-12" />
      <PremiumSkeleton className="h-12" />
    </div>
  );
}

export { PremiumInteractionStates, PremiumSkeletonStrip };
