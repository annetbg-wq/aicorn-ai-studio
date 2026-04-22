import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Clock3,
  HeartHandshake,
  MapPin,
  MessageCircle,
  Users,
} from "lucide-react";

import {
  PremiumCard,
  PremiumCardContent,
  PremiumCardDescription,
  PremiumCardFooter,
  PremiumCardHeader,
  PremiumCardTitle,
} from "@/components/ui/premium-card";
import { PremiumButton } from "@/components/ui/premium-button";
import { PremiumChip } from "@/components/ui/premium-chip";
import type { PremiumTone } from "@/styles/premium-tokens";
import { premiumToneClasses } from "@/styles/premium-tokens";
import { cn } from "@/lib/utils";

interface PremiumEventCardProps {
  title?: string;
  description?: string;
  date?: string;
  location?: string;
  capacity?: string;
  category?: string;
  tone?: PremiumTone;
  className?: string;
}

function PremiumEventCard({
  title = "Saturday skills exchange",
  description = "A guided gathering for neighbors to trade practical skills, meet organizers, and find a small working group.",
  date = "Apr 28, 10:00",
  location = "Civic Hall",
  capacity = "42/60",
  category = "Community",
  tone = "brand",
  className,
}: PremiumEventCardProps) {
  return (
    <PremiumCard variant="interactive" className={cn("overflow-hidden", className)}>
      <div className="h-2 bg-gradient-to-r from-cyan-500 via-emerald-500 to-amber-400" />
      <PremiumCardHeader>
        <div className="flex items-start justify-between gap-4">
          <PremiumChip tone={tone} className={cn("h-8 px-3 text-xs ring-1", premiumToneClasses[tone])}>
            {category}
          </PremiumChip>
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
            <CalendarDays className="size-5" />
          </div>
        </div>
        <PremiumCardTitle>{title}</PremiumCardTitle>
        <PremiumCardDescription>{description}</PremiumCardDescription>
      </PremiumCardHeader>
      <PremiumCardContent className="space-y-3">
        <div className="flex items-center gap-3 text-sm text-[hsl(var(--pm-muted))]">
          <Clock3 className="size-4 text-cyan-600" />
          {date}
        </div>
        <div className="flex items-center gap-3 text-sm text-[hsl(var(--pm-muted))]">
          <MapPin className="size-4 text-emerald-600" />
          {location}
        </div>
        <div className="flex items-center gap-3 text-sm text-[hsl(var(--pm-muted))]">
          <Users className="size-4 text-amber-600" />
          {capacity} attending
        </div>
      </PremiumCardContent>
      <PremiumCardFooter>
        <PremiumButton variant="secondary" className="w-full">
          View event
          <ArrowRight className="size-4" />
        </PremiumButton>
      </PremiumCardFooter>
    </PremiumCard>
  );
}

interface PremiumResourceCardProps {
  title?: string;
  description?: string;
  type?: string;
  meta?: string;
  icon?: LucideIcon;
  tone?: PremiumTone;
  className?: string;
}

function PremiumResourceCard({
  title = "Organizer checklist",
  description = "A field-ready template for planning invites, venue needs, accessibility notes, and follow-up messages.",
  type = "Guide",
  meta = "8 min read",
  icon: Icon = BookOpen,
  tone = "success",
  className,
}: PremiumResourceCardProps) {
  return (
    <PremiumCard variant="interactive" className={className}>
      <PremiumCardHeader>
        <div className="flex items-center justify-between gap-4">
          <div className={cn("flex size-12 items-center justify-center rounded-2xl ring-1", premiumToneClasses[tone])}>
            <Icon className="size-5" />
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {type}
          </span>
        </div>
        <PremiumCardTitle>{title}</PremiumCardTitle>
        <PremiumCardDescription>{description}</PremiumCardDescription>
      </PremiumCardHeader>
      <PremiumCardFooter className="justify-between">
        <span className="text-sm font-semibold text-[hsl(var(--pm-muted))]">
          {meta}
        </span>
        <PremiumButton variant="ghost" size="sm">
          Open
          <ArrowRight className="size-4" />
        </PremiumButton>
      </PremiumCardFooter>
    </PremiumCard>
  );
}

interface PremiumSupportCardProps {
  title?: string;
  description?: string;
  responseTime?: string;
  channels?: string[];
  className?: string;
}

function PremiumSupportCard({
  title = "Member support",
  description = "Route questions, requests, and sensitive cases into a calmer service workflow.",
  responseTime = "Avg. 16m",
  channels = ["Chat", "Email", "Desk"],
  className,
}: PremiumSupportCardProps) {
  return (
    <PremiumCard variant="selected" className={className}>
      <PremiumCardHeader>
        <div className="flex items-center justify-between">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-white text-cyan-700 shadow-[0_10px_26px_rgba(14,165,233,0.12)]">
            <HeartHandshake className="size-5" />
          </div>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-cyan-700">
            {responseTime}
          </span>
        </div>
        <PremiumCardTitle>{title}</PremiumCardTitle>
        <PremiumCardDescription>{description}</PremiumCardDescription>
      </PremiumCardHeader>
      <PremiumCardContent>
        <div className="flex flex-wrap gap-2">
          {channels.map((channel) => (
            <span
              key={channel}
              className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-slate-700"
            >
              <MessageCircle className="size-3.5 text-cyan-600" />
              {channel}
            </span>
          ))}
        </div>
      </PremiumCardContent>
    </PremiumCard>
  );
}

export { PremiumEventCard, PremiumResourceCard, PremiumSupportCard };
