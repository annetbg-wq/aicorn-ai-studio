import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PricingTier {
  name: string;
  price: string;
  period?: string;
  description: string;
  features: string[];
  ctaText: string;
  ctaHref?: string;
  highlighted?: boolean;
  badge?: string;
}

const DEFAULT_TIERS: PricingTier[] = [
  {
    name: 'Starter',
    price: '$0',
    description: 'Perfect for side projects and experiments.',
    features: ['5 projects', '2 GB storage', 'Community support', 'Basic analytics'],
    ctaText: 'Get started free',
  },
  {
    name: 'Pro',
    price: '$29',
    period: '/mo',
    description: 'Everything growing teams need to ship faster.',
    features: [
      'Unlimited projects',
      '50 GB storage',
      'Priority support',
      'Advanced analytics',
      'Custom domains',
    ],
    ctaText: 'Start free trial',
    highlighted: true,
    badge: 'Most popular',
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    description: 'Dedicated infrastructure for large organizations.',
    features: [
      'Everything in Pro',
      'Unlimited storage',
      'Dedicated support',
      'SSO & SAML',
      'SLA guarantee',
    ],
    ctaText: 'Contact sales',
  },
];

export function PricingSection({
  title = 'Simple, transparent pricing',
  subtitle = 'Choose the plan that fits your needs. Upgrade or downgrade at any time.',
  tiers = DEFAULT_TIERS,
}: {
  title?: string;
  subtitle?: string;
  tiers?: PricingTier[];
}) {
  return (
    <section className="bg-background py-20 px-4">
      <div className="mx-auto max-w-5xl text-center">
        <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">{title}</h2>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">{subtitle}</p>

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={cn(
                'relative flex flex-col gap-5 rounded-2xl border p-6 text-left transition-shadow hover:shadow-lg',
                tier.highlighted
                  ? 'border-primary bg-primary/5 shadow-md shadow-primary/10'
                  : 'border-border bg-card',
              )}
            >
              {tier.badge && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                  {tier.badge}
                </span>
              )}

              <div>
                <h3 className="font-semibold text-foreground">{tier.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{tier.description}</p>
              </div>

              <div className="flex items-end gap-1">
                <span className="text-4xl font-bold text-foreground">{tier.price}</span>
                {tier.period && (
                  <span className="mb-1 text-sm text-muted-foreground">{tier.period}</span>
                )}
              </div>

              <ul className="flex flex-1 flex-col gap-2.5">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                    {feature}
                  </li>
                ))}
              </ul>

              <a
                href={tier.ctaHref ?? '#'}
                className={cn(
                  'mt-2 rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition-opacity hover:opacity-90',
                  tier.highlighted
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground',
                )}
              >
                {tier.ctaText}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
