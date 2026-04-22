import * as React from "react";

import { cn } from "@/lib/utils";

function PremiumSkeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-2xl bg-gradient-to-r from-slate-100 via-slate-200 to-slate-100 bg-[length:200%_100%]",
        className,
      )}
      {...props}
    />
  );
}

function PremiumCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-[hsl(var(--pm-line))] bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <PremiumSkeleton className="size-11 rounded-2xl" />
        <div className="min-w-0 flex-1 space-y-2">
          <PremiumSkeleton className="h-4 w-2/3" />
          <PremiumSkeleton className="h-3 w-1/2" />
        </div>
      </div>
      <div className="mt-5 space-y-3">
        <PremiumSkeleton className="h-3 w-full" />
        <PremiumSkeleton className="h-3 w-4/5" />
        <PremiumSkeleton className="h-10 w-full" />
      </div>
    </div>
  );
}

export { PremiumCardSkeleton, PremiumSkeleton };
