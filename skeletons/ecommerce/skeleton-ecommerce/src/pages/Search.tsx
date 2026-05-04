import { useMemo, useState } from 'react';
import { Search as SearchIcon, SlidersHorizontal, Inbox } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/Sheet';
import { ProductCard } from '@/components/ProductCard';
import { FiltersSidebar } from '@/components/FiltersSidebar';
import { EmptyState } from '@/components/EmptyState';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import { SEED_PRODUCTS } from '@/data/seed';

type SortKey = 'relevance' | 'price_asc' | 'price_desc' | 'rating';

export default function Search(): JSX.Element {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [priceRange, setPriceRange] = useState({ min: 0, max: 9999 });
  const [sort, setSort] = useState<SortKey>('relevance');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = SEED_PRODUCTS.filter((p) => {
      if (category !== 'all' && p.category !== category) return false;
      if (p.price < priceRange.min || p.price > priceRange.max) return false;
      if (q && !p.title.toLowerCase().includes(q) && !p.vendor.toLowerCase().includes(q)) return false;
      return true;
    });

    switch (sort) {
      case 'price_asc':  list = [...list].sort((a, b) => a.price - b.price); break;
      case 'price_desc': list = [...list].sort((a, b) => b.price - a.price); break;
      case 'rating':     list = [...list].sort((a, b) => b.rating - a.rating); break;
      default: break;
    }

    return list;
  }, [query, category, priceRange, sort]);

  return (
    <div className="flex min-h-full flex-col safe-top">
      <header className="space-y-3 border-b border-border px-4 py-3">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products..."
            className="pl-9"
            aria-label="Search products"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setFiltersOpen(true)}>
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
          </Button>
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="h-9 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="relevance">Relevance</SelectItem>
              <SelectItem value="price_asc">Price: low to high</SelectItem>
              <SelectItem value="price_desc">Price: high to low</SelectItem>
              <SelectItem value="rating">Top rated</SelectItem>
            </SelectContent>
          </Select>
          <span className="ml-auto text-xs text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? 'item' : 'items'}
          </span>
        </div>
      </header>

      <main className="flex-1 px-3 pb-32 pt-3">
        {filtered.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="Nothing matches"
            description="Try a different search term or fewer filters."
          />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </main>

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent>
          <SheetTitle className="mb-4">Filters</SheetTitle>
          <FiltersSidebar
            category={category}
            onCategoryChange={setCategory}
            priceRange={priceRange}
            onPriceRangeChange={setPriceRange}
          />
          <div className="mt-6">
            <Button className="w-full" onClick={() => setFiltersOpen(false)}>
              Show {filtered.length} results
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
