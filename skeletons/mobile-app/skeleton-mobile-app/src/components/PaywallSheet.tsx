import { Check, Sparkles } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './ui/Sheet';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { cn } from '@/lib/cn';
import { PRICING_TIERS } from '@/data/seed';
import type { SubscriptionPlan } from '@/data/types';

interface PaywallSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the chosen tier id when the user picks a plan. */
  onSelect: (plan: SubscriptionPlan) => void;
  /** Optional context line, e.g. "You've used your 3 free actions today." */
  reason?: string;
}

export function PaywallSheet({
  open,
  onOpenChange,
  onSelect,
  reason,
}: PaywallSheetProps): JSX.Element {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <Badge variant="default">Upgrade</Badge>
          </div>
          <SheetTitle>Unlock the full experience</SheetTitle>
          <SheetDescription>
            {reason ?? 'Choose the plan that fits you best. Cancel anytime.'}
          </SheetDescription>
        </SheetHeader>

        <ul className="space-y-2.5">
          {PRICING_TIERS.filter((tier) => tier.id !== 'free').map((tier) => (
            <li key={tier.id}>
              <button
                type="button"
                onClick={() => onSelect(tier.id)}
                className={cn(
                  'group flex w-full flex-col gap-3 rounded-lg border p-4 text-left transition-colors',
                  tier.highlight
                    ? 'border-primary bg-primary/5 hover:bg-primary/10'
                    : 'border-border bg-card hover:bg-muted',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold">{tier.name}</span>
                    {tier.highlight && <Badge variant="default">Most popular</Badge>}
                  </div>
                  <div className="text-right">
                    <span className="text-xl font-semibold">${tier.pricePerMonth}</span>
                    <span className="ml-0.5 text-xs text-muted-foreground">/mo</span>
                  </div>
                </div>
                <ul className="space-y-1.5">
                  {tier.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2 text-sm text-foreground"
                    >
                      <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </button>
            </li>
          ))}
        </ul>

        <Button variant="ghost" size="sm" className="mt-4 w-full" onClick={() => onOpenChange(false)}>
          Maybe later
        </Button>
      </SheetContent>
    </Sheet>
  );
}
