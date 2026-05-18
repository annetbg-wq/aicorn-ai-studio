import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Clock, Inbox } from 'lucide-react';
import { ROUTES } from '@/config/routes';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/EmptyState';
import { SEED_FEED } from '@/data/seed';

export default function Detail(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  /* SEED: replace with item lookup from your storage layer. */
  const item = SEED_FEED.find((entry) => entry.id === id);

  if (!item) {
    return (
      <div className="flex min-h-full flex-col safe-top">
        <header className="px-4 pt-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="-ml-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </header>
        <main className="flex flex-1 items-center justify-center pb-24">
          <EmptyState
            icon={Inbox}
            title="Item not found"
            description="It may have been removed."
            action={{ label: 'Back to home', onClick: () => navigate(ROUTES.home) }}
          />
        </main>
      </div>
    );
  }

  const duration = typeof item.meta?.duration === 'number' ? item.meta.duration : null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="flex min-h-full flex-col safe-top"
    >
      <header className="px-4 pt-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="-ml-2">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </header>

      <main className="flex-1 space-y-6 px-5 pb-32 pt-4">
        <div className="space-y-2">
          <Badge variant={item.accent === 'brand' ? 'default' : item.accent ?? 'secondary'}>
            {item.kind}
          </Badge>
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">{item.title}</h1>
          <p className="text-base text-muted-foreground">{item.subtitle}</p>
        </div>

        {duration !== null && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>{duration} min</span>
          </div>
        )}

        {/* PRODUCT: replace this section with the real activity / interaction surface. */}
        <section
          aria-label="Activity surface"
          className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground"
        >
          The interactive surface for this item lives here.
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md border-t border-border bg-card/95 p-4 backdrop-blur safe-bottom">
        <Button size="lg" className="w-full" onClick={() => navigate(ROUTES.progress)}>
          Mark as done
        </Button>
      </div>
    </motion.div>
  );
}
