export function CTA({
  title = 'Ready to get started?',
  subtitle = 'Join thousands of teams already building with us. No credit card required.',
  primaryText = 'Start for free',
  primaryHref = '#',
  secondaryText = 'Talk to sales',
  secondaryHref = '#',
}: {
  title?: string;
  subtitle?: string;
  primaryText?: string;
  primaryHref?: string;
  secondaryText?: string;
  secondaryHref?: string;
}) {
  return (
    <section className="relative overflow-hidden bg-background py-24 px-4">
      {/* Gradient blob */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <div className="h-[600px] w-[600px] rounded-full opacity-20 blur-3xl"
          style={{ background: 'radial-gradient(circle, hsl(var(--primary)) 0%, transparent 70%)' }}
        />
      </div>

      <div className="relative mx-auto max-w-3xl text-center">
        <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-5xl">
          {title}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">{subtitle}</p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href={primaryHref}
            className="rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            {primaryText}
          </a>
          <a
            href={secondaryHref}
            className="rounded-lg border border-border bg-background px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
          >
            {secondaryText}
          </a>
        </div>
      </div>
    </section>
  );
}
