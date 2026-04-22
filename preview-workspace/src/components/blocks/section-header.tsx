import * as React from "react";

import { cn } from "@/lib/utils";

interface PremiumSectionHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  align?: "left" | "center";
}

function PremiumSectionHeader({
  className,
  eyebrow,
  title,
  description,
  action,
  align = "left",
  ...props
}: PremiumSectionHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between",
        align === "center" && "items-center text-center sm:flex-col sm:items-center",
        className,
      )}
      {...props}
    >
      <div className="max-w-2xl space-y-3">
        {eyebrow ? (
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-700">
            {eyebrow}
          </p>
        ) : null}
        <div className="space-y-3">
          <h2 className="text-3xl font-semibold leading-tight tracking-normal text-[hsl(var(--pm-ink))] sm:text-4xl">
            {title}
          </h2>
          {description ? (
            <p className="text-base leading-7 text-[hsl(var(--pm-muted))]">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export { PremiumSectionHeader };
