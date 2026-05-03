import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/Card';
import { FEATURES } from '@/data/content';

export function Features(): JSX.Element {
  return (
    <section id="features" aria-labelledby="features-heading" className="px-4 py-20">
      <div className="mx-auto max-w-6xl">
        <header className="mx-auto max-w-2xl text-center">
          <h2 id="features-heading" className="text-3xl font-semibold tracking-tight md:text-4xl">
            Everything you need to ship
          </h2>
          <p className="mt-3 text-lg text-muted-foreground">
            A focused set of capabilities that compose well together — no feature creep.
          </p>
        </header>

        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.3, delay: (i % 3) * 0.05, ease: 'easeOut' }}
            >
              <Card className="h-full transition-colors hover:bg-muted/40">
                <CardContent className="space-y-3 p-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-semibold">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.body}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
