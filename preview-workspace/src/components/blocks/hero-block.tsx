import type { LucideIcon } from "lucide-react";
import { ArrowRight, CalendarDays, CheckCircle2, Sparkles, Users } from "lucide-react";
import { motion } from "framer-motion";

import { PremiumButton } from "@/components/ui/premium-button";
import { PremiumChip } from "@/components/ui/premium-chip";
import { cn } from "@/lib/utils";

interface HeroMetric {
  label: string;
  value: string;
}

interface PremiumHeroBlockProps {
  eyebrow?: string;
  title?: string;
  description?: string;
  primaryAction?: string;
  secondaryAction?: string;
  metrics?: HeroMetric[];
  className?: string;
}

const defaultMetrics = [
  { label: "Weekly signups", value: "2.4k" },
  { label: "Response time", value: "18m" },
  { label: "Trust score", value: "98%" },
];

const heroTimelineItems: Array<{ title: string; detail: string; icon: LucideIcon }> = [
  { title: "Volunteer breakfast", detail: "142 members joined", icon: Users },
  { title: "Resource exchange", detail: "28 offers matched", icon: CheckCircle2 },
  { title: "Support desk", detail: "9 requests resolved", icon: Sparkles },
];

function PremiumHeroBlock({
  eyebrow = "Premium product shell",
  title = "Launch a polished community experience without rebuilding the basics.",
  description = "A normalized React and Tailwind material layer for dashboards, marketplaces, support hubs, event tools, and consumer workflows.",
  primaryAction = "Start from blocks",
  secondaryAction = "View system",
  metrics = defaultMetrics,
  className,
}: PremiumHeroBlockProps) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-[2rem] border border-[hsl(var(--pm-line))] bg-white shadow-[0_30px_90px_rgba(15,23,42,0.12)]",
        className,
      )}
    >
      <div className="grid gap-0 lg:grid-cols-[1.08fr_0.92fr]">
        <div className="flex min-h-[560px] flex-col justify-between p-6 sm:p-10 lg:p-12">
          <div className="space-y-8">
            <PremiumChip selected tone="brand" className="w-fit">
              <Sparkles className="size-4" />
              {eyebrow}
            </PremiumChip>
            <div className="max-w-3xl space-y-6">
              <h1 className="text-5xl font-semibold leading-[0.95] tracking-normal text-[hsl(var(--pm-ink))] sm:text-6xl lg:text-7xl">
                {title}
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-[hsl(var(--pm-muted))]">
                {description}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <PremiumButton size="lg" variant="primary">
                {primaryAction}
                <ArrowRight className="size-5" />
              </PremiumButton>
              <PremiumButton size="lg" variant="secondary">
                {secondaryAction}
              </PremiumButton>
            </div>
          </div>

          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            {metrics.map((metric) => (
              <div
                key={metric.label}
                className="rounded-3xl border border-[hsl(var(--pm-line))] bg-[hsl(var(--pm-surface-soft))] p-4"
              >
                <p className="text-2xl font-semibold text-[hsl(var(--pm-ink))]">
                  {metric.value}
                </p>
                <p className="mt-1 text-sm text-[hsl(var(--pm-muted))]">
                  {metric.label}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-[hsl(var(--pm-line))] bg-[hsl(var(--pm-surface-tint))] p-6 sm:p-10 lg:border-l lg:border-t-0">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="flex h-full min-h-[420px] flex-col justify-between rounded-[1.75rem] border border-white/80 bg-white/90 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.14)] backdrop-blur"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-[hsl(var(--pm-muted))]">
                  This week
                </p>
                <p className="text-2xl font-semibold text-[hsl(var(--pm-ink))]">
                  Neighborhood launch
                </p>
              </div>
              <div className="flex size-12 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
                <CalendarDays className="size-5" />
              </div>
            </div>

            <div className="space-y-3">
              {heroTimelineItems.map(({ title, detail, icon: Icon }) => (
                <div
                  key={title}
                  className="flex items-center gap-4 rounded-3xl border border-[hsl(var(--pm-line))] bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)]"
                >
                  <div className="flex size-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                    <Icon className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-[hsl(var(--pm-ink))]">
                      {title}
                    </p>
                    <p className="text-sm text-[hsl(var(--pm-muted))]">
                      {detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-3xl bg-[hsl(var(--pm-ink))] p-5 text-white">
              <p className="text-sm text-white/70">Readiness</p>
              <div className="mt-3 flex items-end justify-between">
                <p className="text-4xl font-semibold">92%</p>
                <PremiumButton variant="secondary" size="sm">
                  Review
                </PremiumButton>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

export { PremiumHeroBlock };
