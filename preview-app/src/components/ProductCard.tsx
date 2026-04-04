import { Button } from "@/components/ui/button";
import { Link } from 'react-router-dom';
import { Camera, ShoppingBag } from 'lucide-react';
import { Product } from '../data/products';
import { Store } from '../data/stores';

interface ProductCardProps {
  product: Product;
  store?: Store;
  onAddToCart?: (product: Product) => void;
}

export default function ProductCard({ product, store, onAddToCart }: ProductCardProps) {
  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden transition-all duration-200 hover:shadow-md group animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="relative aspect-[4/5] bg-muted overflow-hidden">
        <img
          src={product.imageUrl}
          alt={product.name}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
        {product.arEnabled && (
          <div className="absolute top-2 right-2 bg-primary/90 text-primary-foreground text-[10px] font-semibold px-2 py-1 rounded-full flex items-center gap-1 backdrop-blur-sm">
            <Camera className="w-3 h-3" />
            AR Ready
          </div>
        )}
      </div>

      <div className="p-3 space-y-2">
        <div>
          <h3 className="font-medium text-sm text-foreground truncate">{product.name}</h3>
          {store && <p className="text-xs text-muted-foreground">{store.name}</p>}
        </div>

        <div className="flex items-center justify-between">
          <span className="font-semibold text-foreground">${product.price.toFixed(2)}</span>
          <div className="flex gap-1">
            {product.colors.slice(0, 3).map((color, i) => (
              <div key={i} className="w-3 h-3 rounded-full border border-border bg-muted" title={color} />
            ))}
            {product.colors.length > 3 && (
              <span className="text-[10px] text-muted-foreground ml-0.5">+{product.colors.length - 3}</span>
            )}
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Link
            to={`/ar/tryon/${product.id}`}
            className="flex-1 flex items-center justify-center gap-1.5 bg-primary text-primary-foreground text-xs font-medium py-2.5 rounded-xl transition-all duration-200 hover:opacity-90 active:scale-95"
          >
            <Camera className="w-3.5 h-3.5" />
            Try On
          </Link>
          {onAddToCart && (
            <Button
              onClick={() => onAddToCart(product)}
              className="flex items-center justify-center w-10 bg-secondary text-secondary-foreground rounded-xl transition-all duration-200 hover:bg-accent active:scale-95"
            >
              <ShoppingBag className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}