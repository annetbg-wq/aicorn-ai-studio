import * as React from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

interface PremiumChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  tone?: "neutral" | "brand" | "success" | "warning" | "rose" | "violet";
}

const toneClasses = {
  neutral: "text-slate-700",
  brand: "text-cyan-700",
  success: "text-emerald-700",
  warning: "text-amber-800",
  rose: "text-rose-700",
  violet: "text-violet-700",
};

function PremiumChip({
  className,
  selected = false,
  tone = "neutral",
  children,
  ...props
}: PremiumChipProps) {
  return (
    <button
      type="button"
      className={cn(
        "premium-focus-ring inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition-all duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
        selected
          ? "border-transparent bg-[hsl(var(--pm-ink))] text-white shadow-[0_12px_30px_rgba(15,23,42,0.16)]"
          : "border-[hsl(var(--pm-line))] bg-white shadow-[0_8px_20px_rgba(15,23,42,0.05)] hover:-translate-y-0.5 hover:border-[hsl(var(--pm-line-strong))] hover:shadow-[0_14px_34px_rgba(15,23,42,0.1)]",
        !selected && toneClasses[tone],
        className,
      )}
      aria-pressed={selected}
      {...props}
    >
      {selected ? <Check className="size-4" /> : null}
      {children}
    </button>
  );
}

export { PremiumChip };
