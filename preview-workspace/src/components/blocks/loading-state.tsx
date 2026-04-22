import { PremiumCardSkeleton, PremiumSkeleton } from "@/components/ui/premium-skeleton";
import { cn } from "@/lib/utils";

function PremiumLoadingState({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-5", className)}>
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <PremiumSkeleton className="h-4 w-28" />
          <PremiumSkeleton className="h-8 w-64 max-w-[70vw]" />
        </div>
        <PremiumSkeleton className="h-11 w-32" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <PremiumCardSkeleton />
        <PremiumCardSkeleton />
        <PremiumCardSkeleton />
      </div>
    </div>
  );
}

export { PremiumLoadingState };
