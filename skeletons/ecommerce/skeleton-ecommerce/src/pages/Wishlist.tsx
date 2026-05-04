import { Heart } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { ProductCard } from '@/components/ProductCard';
import { EmptyState } from '@/components/EmptyState';
import { SEED_PRODUCTS } from '@/data/seed';

export default function Wishlist(): JSX.Element {
  const { wishlist } = useApp();
  const products = SEED_PRODUCTS.filter((p) => wishlist.has(p.id));

  return (
    <div className="flex min-h-full flex-col safe-top">
      <header className="border-b border-border px-5 pb-3 pt-6">
        <h1 className="text-2xl font-semibold tracking-tight">Saved</h1>
        <p className="text-sm text-muted-foreground">
          {products.length} {products.length === 1 ? 'item' : 'items'}
        </p>
      </header>

      <main className="flex-1 px-3 pb-32 pt-3">
        {products.length === 0 ? (
          <EmptyState
            icon={Heart}
            title="No saved items"
            description="Tap the heart on any product to save it for later."
          />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
