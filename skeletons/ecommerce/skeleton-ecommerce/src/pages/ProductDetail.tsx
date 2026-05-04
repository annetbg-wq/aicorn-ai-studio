import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Heart, Inbox, Truck } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ImageGallery } from '@/components/ImageGallery';
import { RatingStars } from '@/components/RatingStars';
import { ReviewItem } from '@/components/ReviewItem';
import { EmptyState } from '@/components/EmptyState';
import { APP_CONFIG } from '@/config/app';
import { ROUTES } from '@/config/routes';
import { SEED_PRODUCTS, SEED_REVIEWS } from '@/data/seed';
import { formatCount, formatPrice } from '@/lib/format';
import { cn } from '@/lib/cn';

export default function ProductDetail(): JSX.Element {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const { cart, wishlist } = useApp();

  /* SEED: replace with real product fetch. */
  const product = SEED_PRODUCTS.find((p) => p.id === productId);
  const reviews = SEED_REVIEWS.filter((r) => r.productId === productId);

  const [variantId, setVariantId] = useState<string>(product?.variants[0]?.id ?? '');

  if (!product) {
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
            title="Product not found"
            action={{ label: 'Back to shop', onClick: () => navigate(ROUTES.home) }}
          />
        </main>
      </div>
    );
  }

  const variant = product.variants.find((v) => v.id === variantId) ?? product.variants[0];
  const onSale = product.compareAtPrice && product.compareAtPrice > product.price;
  const saved = wishlist.has(product.id);
  const qualifiesForFreeShipping = product.price >= APP_CONFIG.freeShippingThreshold;

  // Pin narrowed values for the handler closure.
  const productId_pin = product.id;

  function handleAddToCart(): void {
    if (!variant) return;
    cart.add(productId_pin, variant.id, 1);
  }

  return (
    <div className="flex min-h-full flex-col safe-top">
      <header className="flex items-center justify-between px-4 pt-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="-ml-2">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <button
          type="button"
          aria-label={saved ? 'Remove from saved' : 'Save'}
          onClick={() => wishlist.toggle(product.id)}
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted"
        >
          <Heart
            className={cn('h-4 w-4', saved ? 'text-rose' : 'text-muted-foreground')}
            fill={saved ? 'currentColor' : 'none'}
          />
        </button>
      </header>

      <main className="flex-1 space-y-5 px-4 pb-32 pt-3">
        <ImageGallery imageKeys={product.imageKeys} alt={product.title} />

        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {product.vendor}
          </p>
          <h1 className="text-xl font-semibold leading-tight tracking-tight">{product.title}</h1>
          <div className="flex items-center gap-2 text-xs">
            <RatingStars value={product.rating} size="md" />
            <span className="text-muted-foreground">
              {product.rating.toFixed(1)} · {formatCount(product.reviewCount)} reviews
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold">{formatPrice(product.price)}</span>
            {onSale && product.compareAtPrice && (
              <>
                <span className="text-sm text-muted-foreground line-through">
                  {formatPrice(product.compareAtPrice)}
                </span>
                <Badge variant="rose">Sale</Badge>
              </>
            )}
          </div>
        </div>

        <p className="text-sm leading-relaxed text-muted-foreground">{product.description}</p>

        {qualifiesForFreeShipping && (
          <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
            <Truck className="h-3.5 w-3.5" />
            Qualifies for free shipping
          </div>
        )}

        <div>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {product.variants.length === 1 ? 'Size' : 'Options'}
          </h2>
          <div className="flex flex-wrap gap-2">
            {product.variants.map((v) => (
              <button
                key={v.id}
                type="button"
                disabled={!v.inStock}
                onClick={() => setVariantId(v.id)}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
                  variantId === v.id
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-foreground hover:bg-muted',
                  !v.inStock && 'cursor-not-allowed opacity-50 line-through',
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        <section aria-labelledby="reviews-heading">
          <h2 id="reviews-heading" className="text-sm font-semibold tracking-tight">
            Reviews
          </h2>
          {reviews.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No reviews yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {reviews.map((r) => (
                <li key={r.id}>
                  <ReviewItem review={r} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md border-t border-border bg-card/95 p-4 backdrop-blur safe-bottom">
        <Button
          size="lg"
          className="w-full"
          disabled={!variant?.inStock}
          onClick={handleAddToCart}
        >
          {variant?.inStock ? `Add to bag — ${formatPrice(product.price)}` : 'Sold out'}
        </Button>
      </div>
    </div>
  );
}
