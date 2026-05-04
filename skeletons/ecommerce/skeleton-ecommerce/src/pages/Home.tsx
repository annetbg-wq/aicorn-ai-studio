import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { ProductCard } from '@/components/ProductCard';
import { ProductImage } from '@/components/ProductImage';
import { Button } from '@/components/ui/Button';
import { APP_CONFIG } from '@/config/app';
import { ROUTES } from '@/config/routes';
import { SEED_PRODUCTS } from '@/data/seed';

export default function Home(): JSX.Element {
  /* SEED: replace with curated module from CMS / merch system. */
  const featured = SEED_PRODUCTS.filter((p) => p.isNew).slice(0, 4);
  const popular = SEED_PRODUCTS.slice(0, 6);

  return (
    <div className="flex min-h-full flex-col safe-top">
      <header className="px-5 py-3 border-b border-border">
        <p className="text-base font-semibold tracking-tight">{APP_CONFIG.name}</p>
        <p className="text-xs text-muted-foreground">{APP_CONFIG.tagline}</p>
      </header>

      <main className="flex-1 pb-32">
        {/* Hero */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="px-3 pt-4"
          aria-labelledby="hero-heading"
        >
          <div className="relative overflow-hidden rounded-lg">
            <ProductImage imageKey="gradient-1" alt="Featured collection" aspect="wide" />
            <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-overlay/60 to-transparent p-5">
              <h2 id="hero-heading" className="text-xl font-semibold text-primary-foreground">
                {/* PRODUCT: replace hero copy. */}
                New arrivals for the season
              </h2>
              <p className="mt-1 text-sm text-primary-foreground/85">
                Restocked favorites and a few new things.
              </p>
              <Button asChild size="sm" className="mt-3 self-start">
                <Link to={ROUTES.search}>
                  Shop now
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </div>
        </motion.section>

        {/* Featured */}
        <section aria-labelledby="featured-heading" className="px-3 pt-6">
          <header className="flex items-center justify-between px-1 pb-2">
            <h2 id="featured-heading" className="text-sm font-semibold tracking-tight">
              Just landed
            </h2>
            <Link
              to={ROUTES.search}
              className="text-xs font-medium text-primary hover:underline"
            >
              See all
            </Link>
          </header>
          <div className="grid grid-cols-2 gap-3">
            {featured.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>

        {/* Popular */}
        <section aria-labelledby="popular-heading" className="px-3 pt-6">
          <header className="flex items-center justify-between px-1 pb-2">
            <h2 id="popular-heading" className="text-sm font-semibold tracking-tight">
              Popular this week
            </h2>
            <Link
              to={ROUTES.search}
              className="text-xs font-medium text-primary hover:underline"
            >
              See all
            </Link>
          </header>
          <div className="grid grid-cols-2 gap-3">
            {popular.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
