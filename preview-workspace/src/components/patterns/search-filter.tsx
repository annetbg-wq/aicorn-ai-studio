import * as React from "react";
import { Command, Search, SlidersHorizontal, X } from "lucide-react";

import { PremiumButton } from "@/components/ui/premium-button";
import { PremiumChip } from "@/components/ui/premium-chip";
import { PremiumInput } from "@/components/ui/premium-input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface PremiumSearchBarProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
}

function PremiumSearchBar({
  value = "",
  onChange,
  placeholder = "Search events, resources, support",
  className,
}: PremiumSearchBarProps) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[hsl(var(--pm-muted-soft))]" />
      <PremiumInput
        type="search"
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        className="h-14 pl-11 pr-28"
      />
      <div className="absolute right-2 top-1/2 hidden -translate-y-1/2 items-center gap-2 sm:flex">
        {value ? (
          <button
            type="button"
            className="premium-focus-ring flex size-9 items-center justify-center rounded-xl text-[hsl(var(--pm-muted))] hover:bg-slate-100 hover:text-[hsl(var(--pm-ink))]"
            onClick={() => onChange?.("")}
            aria-label="Clear search"
          >
            <X className="size-4" />
          </button>
        ) : null}
        <span className="flex h-9 items-center gap-1 rounded-xl bg-slate-100 px-2.5 text-xs font-bold text-slate-500">
          <Command className="size-3" /> K
        </span>
      </div>
    </div>
  );
}

interface PremiumFilterChipsProps {
  items: string[];
  selected?: string;
  onSelect?: (item: string) => void;
  className?: string;
}

function PremiumFilterChips({
  items,
  selected,
  onSelect,
  className,
}: PremiumFilterChipsProps) {
  return (
    <div className={cn("flex gap-2 overflow-x-auto pb-1", className)}>
      {items.map((item) => (
        <PremiumChip
          key={item}
          selected={item === selected}
          onClick={() => onSelect?.(item)}
        >
          {item}
        </PremiumChip>
      ))}
    </div>
  );
}

interface PremiumFilterTabsProps {
  items: string[];
  value: string;
  onValueChange?: (value: string) => void;
  className?: string;
}

function PremiumFilterTabs({
  items,
  value,
  onValueChange,
  className,
}: PremiumFilterTabsProps) {
  return (
    <Tabs value={value} onValueChange={onValueChange} className={className}>
      <TabsList className="h-12 rounded-2xl bg-[hsl(var(--pm-surface-soft))] p-1">
        {items.map((item) => (
          <TabsTrigger
            key={item}
            value={item}
            className="h-10 rounded-xl px-4 text-sm font-semibold text-[hsl(var(--pm-muted))] data-[state=active]:bg-white data-[state=active]:text-[hsl(var(--pm-ink))] data-[state=active]:shadow-[0_8px_20px_rgba(15,23,42,0.08)]"
          >
            {item}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

interface PremiumSearchFilterBarProps {
  query?: string;
  onQueryChange?: (value: string) => void;
  filters: string[];
  selectedFilter?: string;
  onFilterChange?: (value: string) => void;
  className?: string;
}

function PremiumSearchFilterBar({
  query,
  onQueryChange,
  filters,
  selectedFilter,
  onFilterChange,
  className,
}: PremiumSearchFilterBarProps) {
  return (
    <div
      className={cn(
        "rounded-[2rem] border border-[hsl(var(--pm-line))] bg-white p-3 shadow-[0_18px_50px_rgba(15,23,42,0.08)]",
        className,
      )}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <PremiumSearchBar
          value={query}
          onChange={onQueryChange}
          className="min-w-0 flex-1"
        />
        <PremiumButton variant="secondary" className="justify-center lg:w-auto">
          <SlidersHorizontal className="size-4" />
          Filters
        </PremiumButton>
      </div>
      <PremiumFilterChips
        items={filters}
        selected={selectedFilter}
        onSelect={onFilterChange}
        className="mt-3"
      />
    </div>
  );
}

export {
  PremiumFilterChips,
  PremiumFilterTabs,
  PremiumSearchBar,
  PremiumSearchFilterBar,
};
