import { cn } from '@/lib/cn';

interface ProductImageProps {
  imageKey: string | undefined;
  alt: string;
  className?: string;
  /** Square aspect ratio by default. */
  aspect?: 'square' | 'portrait' | 'wide';
}

const GRADIENT_BY_KEY: Record<string, string> = {
  'gradient-1': 'bg-gradient-to-br from-primary/20 via-violet/15 to-rose/15',
  'gradient-2': 'bg-gradient-to-br from-success/20 via-primary/15 to-warning/15',
  'gradient-3': 'bg-gradient-to-br from-warning/15 via-rose/15 to-violet/20',
};

const ASPECT_CLASS = {
  square: 'aspect-square',
  portrait: 'aspect-[4/5]',
  wide: 'aspect-[16/9]',
};

/**
 * Gradient placeholder used in skeletons where a real image URL is not
 * yet available. PRODUCT: replace with <img src={...} alt={...} />.
 */
export function ProductImage({
  imageKey,
  alt,
  className,
  aspect = 'square',
}: ProductImageProps): JSX.Element {
  const gradient = imageKey ? GRADIENT_BY_KEY[imageKey] : undefined;
  return (
    <div
      role="img"
      aria-label={alt}
      className={cn('w-full overflow-hidden', ASPECT_CLASS[aspect], gradient ?? 'bg-muted', className)}
    />
  );
}
