import { useState } from 'react';
import { Check } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { PRICING } from '@/data/content';
import { cn } from '@/lib/cn';

type Cycle = 'monthly' | 'annual';

export function Pricing(): JSX.Element {
  const [cycle, setCycle] = useState<Cycle>('monthly');

  return (
    <section id="pricing" aria-labelledby="pricing-heading" className="px-4 py-20">
      <div className="mx-auto max-w-5xl">
        <header className="mx-auto max-w-2xl text-center">
          <h2 id="pricing-heading" className="text-3xl font-semibold tracking-tight md:text-4xl">
            Simple, fair pricing
          </h2>
          <p className="mt-3 text-lg text-muted-foreground">
            Free to start. Pay only when your team grows.
          </p>

          <div className="mt-8 inline-flex rounded-full border border-border bg-muted p-1">
            <CycleButton active={cycle === 'monthly'} onClick={() => setCycle('monthly')}>
              Monthly
            </CycleButton>
            <CycleButton active={cycle === 'annual'} onClick={() => setCycle('annual')}>
              Annual
              <span className="ml-1 text-xs font-medium text-success">−17%</span>
            </CycleButton>
          </div>
        </header>

        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
          {PRICING.map((tier) => {
            const price = cycle === 'monthly' ? tier.monthly : tier.annual;
            return (
              <Card
                key={tier.name}
                className={cn(
                  'relative flex flex-col transition-colors',
                  tier.highlight && 'border-primary',
                )}
              >
                {tier.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge>Most popular</Badge>
                  </div>
                )}
                <CardContent className="flex flex-1 flex-col gap-4 p-6">
                  <div>
                    <h3 className="text-lg font-semibold">{tier.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{tier.description}</p>
                  </div>
                  <div>
                    <span className="text-4xl font-semibold tracking-tight">${price}</span>
                    <span className="ml-1 text-sm text-muted-foreground">/mo</span>
                    {cycle === 'annual' && tier.monthly > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">billed annually</p>
                    )}
                  </div>
                  <ul className="space-y-2 text-sm">
                    {tier.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    variant={tier.highlight ? 'default' : 'outline'}
                    className="mt-auto w-full"
                  >
                    {tier.cta}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}

interface CycleButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function CycleButton({ active, onClick, children }: CycleButtonProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
        active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
      )}
    >
      {children}
    </button>
  );
}
