import { cn } from '@/lib/cn';
import { SEED_CATEGORIES } from '@/data/seed';

interface FiltersSidebarProps {
  category: string;
  onCategoryChange: (next: string) => void;
  priceRange: { min: number; max: number };
  onPriceRangeChange: (next: { min: number; max: number }) => void;
}

const PRICE_BANDS: ReadonlyArray<{ label: string; min: number; max: number }> = [
  { label: 'Any',          min: 0,    max: 9999 },
  { label: 'Under $50',    min: 0,    max: 49 },
  { label: '$50 – $100',   min: 50,   max: 99 },
  { label: '$100 – $200',  min: 100,  max: 199 },
  { label: '$200+',        min: 200,  max: 9999 },
];

export function FiltersSidebar({
  category,
  onCategoryChange,
  priceRange,
  onPriceRangeChange,
}: FiltersSidebarProps): JSX.Element {
  return (
    <aside className="space-y-5 text-sm">
      <section>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Category
        </h3>
        <ul className="space-y-1">
          {SEED_CATEGORIES.map((c) => (
            <li key={c}>
              <button
                type="button"
                onClick={() => onCategoryChange(c)}
                className={cn(
                  'block w-full rounded-md px-2 py-1 text-left text-sm capitalize transition-colors',
                  category === c
                    ? 'bg-primary/10 font-medium text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {c}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Price
        </h3>
        <ul className="space-y-1">
          {PRICE_BANDS.map((band) => {
            const active = priceRange.min === band.min && priceRange.max === band.max;
            return (
              <li key={band.label}>
                <button
                  type="button"
                  onClick={() => onPriceRangeChange({ min: band.min, max: band.max })}
                  className={cn(
                    'block w-full rounded-md px-2 py-1 text-left text-sm transition-colors',
                    active
                      ? 'bg-primary/10 font-medium text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {band.label}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </aside>
  );
}
