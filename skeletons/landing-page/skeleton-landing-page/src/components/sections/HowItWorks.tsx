import { motion } from 'framer-motion';
import { STEPS } from '@/data/content';

export function HowItWorks(): JSX.Element {
  return (
    <section id="how" aria-labelledby="how-heading" className="bg-muted/30 px-4 py-20">
      <div className="mx-auto max-w-5xl">
        <header className="mx-auto max-w-2xl text-center">
          <h2 id="how-heading" className="text-3xl font-semibold tracking-tight md:text-4xl">
            From idea to live in three steps
          </h2>
          <p className="mt-3 text-lg text-muted-foreground">
            No long onboarding, no migrations.
          </p>
        </header>

        <ol className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <motion.li
              key={step.number}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.3, delay: i * 0.08, ease: 'easeOut' }}
              className="space-y-3 rounded-lg border border-border bg-card p-6"
            >
              <span className="text-sm font-mono font-semibold text-primary">{step.number}</span>
              <h3 className="text-lg font-semibold">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.body}</p>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}
