import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { ProductImage } from './ProductImage';
import { RatingStars } from './RatingStars';
import { Badge } from './ui/Badge';
import { productRoute } from '@/config/routes';
import { formatPrice, formatCount } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { Product } from '@/data/types';

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps): JSX.Element {
  const { wishlist } = useApp();
  const saved = wishlist.has(product.id);
  const onSale = product.compareAtPrice && product.compareAtPrice > product.price;

  return (
    <Link
      to={productRoute(product.id)}
      className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
    >
      <div className="relative overflow-hidden rounded-md">
        <ProductImage
          imageKey={product.imageKeys[0]}
          alt={product.title}
          className="transition-transform group-hover:scale-[1.02]"
        />

        {(product.isNew || onSale) && (
          <div className="absolute left-2 top-2 flex flex-col gap-1">
            {product.isNew && <Badge variant="default">New</Badge>}
            {onSale && <Badge variant="rose">Sale</Badge>}
          </div>
        )}

        <button
          type="button"
          aria-label={saved ? 'Remove from saved' : 'Save for later'}
          onClick={(e) => {
            e.preventDefault();
            wishlist.toggle(product.id);
          }}
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-card/90 backdrop-blur transition-colors hover:bg-card"
        >
          <Heart
            className={cn('h-4 w-4 transition-colors', saved ? 'text-rose' : 'text-muted-foreground')}
            fill={saved ? 'currentColor' : 'none'}
          />
        </button>
      </div>

      <div className="mt-2 px-1">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{product.vendor}</p>
        <h3 className="mt-0.5 truncate text-sm font-medium">{product.title}</h3>
        <div className="mt-1 flex items-center gap-1 text-xs">
          <RatingStars value={product.rating} />
          <span className="text-muted-foreground">({formatCount(product.reviewCount)})</span>
        </div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-sm font-semibold">{formatPrice(product.price)}</span>
          {onSale && product.compareAtPrice && (
            <span className="text-xs text-muted-foreground line-through">
              {formatPrice(product.compareAtPrice)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
