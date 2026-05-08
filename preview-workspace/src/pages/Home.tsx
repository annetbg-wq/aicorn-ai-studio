import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Inbox } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { APP_CONFIG } from '@/config/app';
import { ROUTES, detailRoute } from '@/config/routes';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/EmptyState';
import { PaywallSheet } from '@/components/PaywallSheet';
import { SEED_FEED } from '@/data/seed';
import type { FeedItem } from '@/data/types';

const ACCENT_TO_BADGE: Record<
  NonNullable<FeedItem['accent']>,
  'default' | 'success' | 'warning' | 'rose' | 'violet'
> = {
  brand: 'default',
  success: 'success',
  warning: 'warning',
  rose: 'rose',
  violet: 'violet',
};

export default function Home(): JSX.Element {
  const navigate = useNavigate();
  const { profile, loadingState, isPremium, consumeAction, setPlan } = useApp();
  const [paywallOpen, setPaywallOpen] = useState(false);

  /* SEED: replace with data from your storage layer (localStorage, IndexedDB, API). */
  const items: readonly FeedItem[] = SEED_FEED;

  function handlePrimaryAction(): void {
    if (!isPremium && !consumeAction(APP_CONFIG.freeActionLimit)) {
      setPaywallOpen(true);
      return;
    }
    navigate(ROUTES.create);
  }

  return (
    <div className="relative flex min-h-full flex-col safe-top">
      <header className="px-5 pb-3 pt-6">
        <p className="text-sm text-muted-foreground">Hello, {profile.name}</p>
        {/* PRODUCT: replace with a daily/contextual greeting line. */}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Today's space</h1>
      </header>

      <main className="flex-1 px-5 pb-32">
        {loadingState === 'loading' ? (
          <FeedSkeleton />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="Nothing here yet"
            description="Add your first item to get started."
            action={{ label: 'Add item', onClick: handlePrimaryAction }}
          />
        ) : (
          <ul className="space-y-3">
            {items.map((item, index) => (
              <motion.li
                key={item.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: index * 0.04, ease: 'easeOut' }}
              >
                <Card
                  role="link"
                  tabIndex={0}
                  onClick={() => navigate(detailRoute(item.id))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') navigate(detailRoute(item.id));
                  }}
                  className="cursor-pointer transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 space-y-1">
                        <CardTitle>{item.title}</CardTitle>
                        <CardDescription>{item.subtitle}</CardDescription>
                      </div>
                      {item.accent && (
                        <Badge variant={ACCENT_TO_BADGE[item.accent]}>{item.kind}</Badge>
                      )}
                    </div>
                  </CardHeader>
                </Card>
              </motion.li>
            ))}
          </ul>
        )}
      </main>

      <Button
        onClick={handlePrimaryAction}
        size="icon"
        className="fixed bottom-24 right-5 z-30 h-14 w-14 rounded-full shadow-lg shadow-primary/30"
        aria-label="Add new item"
      >
        <Plus className="h-6 w-6" strokeWidth={2.4} />
      </Button>

      <PaywallSheet
        open={paywallOpen}
        onOpenChange={setPaywallOpen}
        onSelect={(plan) => {
          setPlan(plan);
          setPaywallOpen(false);
        }}
        reason={`You've used your ${APP_CONFIG.freeActionLimit} free actions. Upgrade to keep going.`}
      />
    </div>
  );
}

function FeedSkeleton(): JSX.Element {
  return (
    <div className="space-y-3">
      <Skeleton className="h-24 w-full rounded-lg" />
      <Skeleton className="h-24 w-full rounded-lg" />
      <Skeleton className="h-24 w-full rounded-lg" />
    </div>
  );
}
