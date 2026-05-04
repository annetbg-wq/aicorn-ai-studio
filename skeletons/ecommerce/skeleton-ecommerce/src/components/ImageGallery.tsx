import { useState } from 'react';
import { ProductImage } from './ProductImage';
import { cn } from '@/lib/cn';

interface ImageGalleryProps {
  imageKeys: readonly string[];
  alt: string;
}

export function ImageGallery({ imageKeys, alt }: ImageGalleryProps): JSX.Element {
  const [activeIndex, setActiveIndex] = useState(0);
  const safeKeys = imageKeys.length > 0 ? imageKeys : [undefined];

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg">
        <ProductImage imageKey={safeKeys[activeIndex]} alt={alt} aspect="square" />
      </div>
      {safeKeys.length > 1 && (
        <div className="grid grid-cols-4 gap-2">
          {safeKeys.map((key, i) => (
            <button
              key={`${key ?? 'placeholder'}-${i}`}
              type="button"
              onClick={() => setActiveIndex(i)}
              aria-label={`View image ${i + 1}`}
              aria-current={i === activeIndex}
              className={cn(
                'overflow-hidden rounded-md border-2 transition-colors',
                i === activeIndex ? 'border-primary' : 'border-transparent hover:border-border',
              )}
            >
              <ProductImage imageKey={key} alt={`${alt} thumbnail ${i + 1}`} aspect="square" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
