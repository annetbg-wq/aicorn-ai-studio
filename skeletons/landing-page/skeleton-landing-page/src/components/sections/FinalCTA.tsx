import { ArrowRight } from 'lucide-react';
import { APP_CONFIG } from '@/config/app';
import { Button } from '@/components/ui/Button';

export function FinalCTA(): JSX.Element {
  return (
    <section id="cta" aria-labelledby="cta-heading" className="px-4 py-20">
      <div className="mx-auto max-w-4xl">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/15 via-card to-card px-6 py-16 text-center md:px-12">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/20 blur-3xl"
          />
          <h2 id="cta-heading" className="text-3xl font-semibold tracking-tight md:text-4xl">
            Start in two minutes.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-lg text-muted-foreground">
            No credit card. No long onboarding. Just a working starting point.
          </p>
          <div className="mt-8 flex justify-center">
            <Button asChild size="lg">
              <a href={APP_CONFIG.primaryCtaHref}>
                {APP_CONFIG.primaryCtaLabel}
                <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
