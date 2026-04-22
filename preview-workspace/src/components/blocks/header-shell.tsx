import { Bell, Command, Search, Settings } from "lucide-react";

import { PremiumButton } from "@/components/ui/premium-button";
import { cn } from "@/lib/utils";

interface HeaderNavItem {
  label: string;
  active?: boolean;
}

interface PremiumHeaderShellProps {
  brand?: string;
  navItems?: HeaderNavItem[];
  className?: string;
}

const defaultNavItems = [
  { label: "Discover", active: true },
  { label: "Events" },
  { label: "Resources" },
  { label: "Support" },
];

function PremiumHeaderShell({
  brand = "Premium Materials",
  navItems = defaultNavItems,
  className,
}: PremiumHeaderShellProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b border-[hsl(var(--pm-line))] bg-white/88 backdrop-blur-xl",
        className,
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <a href="#/materials" className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[hsl(var(--pm-ink))] text-sm font-bold text-white">
            PM
          </span>
          <span className="truncate text-base font-semibold text-[hsl(var(--pm-ink))]">
            {brand}
          </span>
        </a>

        <nav className="hidden items-center rounded-full bg-[hsl(var(--pm-surface-soft))] p-1 md:flex">
          {navItems.map((item) => (
            <button
              key={item.label}
              type="button"
              className={cn(
                "premium-focus-ring h-9 rounded-full px-4 text-sm font-semibold transition-all",
                item.active
                  ? "bg-white text-[hsl(var(--pm-ink))] shadow-[0_8px_20px_rgba(15,23,42,0.08)]"
                  : "text-[hsl(var(--pm-muted))] hover:text-[hsl(var(--pm-ink))]",
              )}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="ml-auto hidden min-w-0 flex-1 justify-end lg:flex">
          <label className="premium-focus-ring flex h-11 w-full max-w-sm items-center gap-3 rounded-2xl border border-[hsl(var(--pm-line))] bg-white px-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
            <Search className="size-4 text-[hsl(var(--pm-muted-soft))]" />
            <input
              className="min-w-0 flex-1 bg-transparent text-sm text-[hsl(var(--pm-ink))] outline-none placeholder:text-[hsl(var(--pm-muted-soft))]"
              placeholder="Search materials"
              type="search"
            />
            <span className="hidden items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500 xl:flex">
              <Command className="size-3" /> K
            </span>
          </label>
        </div>

        <div className="ml-auto flex items-center gap-2 lg:ml-2">
          <PremiumButton variant="ghost" size="icon" aria-label="Notifications">
            <Bell className="size-5" />
          </PremiumButton>
          <PremiumButton variant="secondary" size="icon" aria-label="Settings">
            <Settings className="size-5" />
          </PremiumButton>
        </div>
      </div>
    </header>
  );
}

export { PremiumHeaderShell };
