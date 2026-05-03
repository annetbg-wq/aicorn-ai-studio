import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { APP_CONFIG } from '@/config/app';
import { Button } from '@/components/ui/Button';

export function Hero(): JSX.Element {
  return (
    <section
      id="top"
      aria-labelledby="hero-heading"
      className="relative overflow-hidden px-4 pb-20 pt-16 md:pt-24"
    >
      {/* Decorative gradient — uses tokens, never hardcoded colors. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[800px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
      />

      <div className="relative mx-auto max-w-3xl text-center">
        <motion.h1
          id="hero-heading"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="text-4xl font-semibold leading-tight tracking-tight md:text-6xl"
        >
          {APP_CONFIG.tagline}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08, ease: 'easeOut' }}
          className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl"
        >
          {APP_CONFIG.subtitle}
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.16 }}
          className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <Button asChild size="lg">
            <a href={APP_CONFIG.primaryCtaHref}>
              {APP_CONFIG.primaryCtaLabel}
              <ArrowRight className="h-4 w-4" />
            </a>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href={APP_CONFIG.secondaryCtaHref}>{APP_CONFIG.secondaryCtaLabel}</a>
          </Button>
        </motion.div>
      </div>

      {/* Hero media placeholder — agent replaces with a real screenshot or video. */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.24 }}
        className="relative mx-auto mt-16 max-w-5xl"
      >
        <div className="aspect-video overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-overlay/10">
          {/* PRODUCT: replace with an <img>, <video>, or interactive demo. */}
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-muted to-card text-sm text-muted-foreground">
            Hero media goes here
          </div>
        </div>
      </motion.div>
    </section>
  );
}
