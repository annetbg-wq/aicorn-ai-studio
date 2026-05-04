import { Link } from 'react-router-dom';
import { ShoppingBag, Minus, Plus, Trash2, Truck } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/Button';
import { ProductImage } from '@/components/ProductImage';
import { EmptyState } from '@/components/EmptyState';
import { Progress } from '@/components/ui/Progress';
import { ROUTES, productRoute } from '@/config/routes';
import { APP_CONFIG } from '@/config/app';
import { formatPrice } from '@/lib/format';

export default function Cart(): JSX.Element {
  const { cart } = useApp();

  if (cart.lines.length === 0) {
    return (
      <div className="flex min-h-full flex-col safe-top">
        <header className="border-b border-border px-5 pb-3 pt-6">
          <h1 className="text-2xl font-semibold tracking-tight">Bag</h1>
        </header>
        <main className="flex flex-1 items-center justify-center pb-24">
          <EmptyState
            icon={ShoppingBag}
            title="Your bag is empty"
            description="Items you add will appear here."
            action={{
              label: 'Start shopping',
              onClick: () => {
                window.location.assign(ROUTES.home);
              },
            }}
          />
        </main>
      </div>
    );
  }

  const remaining = Math.max(0, APP_CONFIG.freeShippingThreshold - cart.subtotal);
  const shippingProgress = Math.min(100, (cart.subtotal / APP_CONFIG.freeShippingThreshold) * 100);

  return (
    <div className="flex min-h-full flex-col safe-top">
      <header className="border-b border-border px-5 pb-3 pt-6">
        <h1 className="text-2xl font-semibold tracking-tight">Bag</h1>
        <p className="text-sm text-muted-foreground">
          {cart.itemCount} {cart.itemCount === 1 ? 'item' : 'items'}
        </p>
      </header>

      <main className="flex-1 px-3 pb-32 pt-3">
        {remaining > 0 ? (
          <div className="mb-3 rounded-md border border-border bg-card p-3">
            <p className="text-xs">
              Add <span className="font-semibold">{formatPrice(remaining)}</span> for free shipping
            </p>
            <Progress value={shippingProgress} className="mt-2" />
          </div>
        ) : (
          <div className="mb-3 flex items-center gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
            <Truck className="h-3.5 w-3.5" />
            You qualify for free shipping
          </div>
        )}

        <ul className="space-y-2">
          {cart.lines.map((line) => (
            <li key={`${line.productId}-${line.variantId}`}>
              <article className="flex gap-3 rounded-md border border-border bg-card p-3">
                <Link
                  to={productRoute(line.productId)}
                  className="flex-shrink-0 overflow-hidden rounded-md"
                  aria-label={`View ${line.productTitle}`}
                >
                  <ProductImage
                    imageKey={line.imageKey}
                    alt={line.productTitle}
                    className="h-20 w-20"
                  />
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {line.vendor}
                  </p>
                  <Link
                    to={productRoute(line.productId)}
                    className="block truncate text-sm font-medium hover:underline"
                  >
                    {line.productTitle}
                  </Link>
                  <p className="text-xs text-muted-foreground">{line.variantLabel}</p>

                  <div className="mt-2 flex items-center justify-between">
                    <div className="inline-flex items-center rounded-md border border-border">
                      <button
                        type="button"
                        aria-label="Decrease quantity"
                        onClick={() =>
                          cart.setQuantity(line.productId, line.variantId, line.quantity - 1)
                        }
                        className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-6 text-center text-xs font-medium tabular-nums">
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        aria-label="Increase quantity"
                        onClick={() =>
                          cart.setQuantity(line.productId, line.variantId, line.quantity + 1)
                        }
                        className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    <span className="text-sm font-semibold tabular-nums">
                      {formatPrice(line.unitPrice * line.quantity)}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Remove"
                  onClick={() => cart.remove(line.productId, line.variantId)}
                  className="self-start rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-rose"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </article>
            </li>
          ))}
        </ul>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md border-t border-border bg-card/95 p-4 backdrop-blur safe-bottom">
        <div className="mb-3 flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">Subtotal</span>
          <span className="text-lg font-semibold tabular-nums">{formatPrice(cart.subtotal)}</span>
        </div>
        <Button asChild size="lg" className="w-full">
          <Link to={ROUTES.checkout}>Checkout</Link>
        </Button>
      </div>
    </div>
  );
}
