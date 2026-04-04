import { SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FilterBarProps {
  categories: string[];
  selectedCategory: string;
  onCategoryChange: (cat: string) => void;
  sortBy: string;
  onSortChange: (sort: string) => void;
}

const sortOptions = [
  { value: 'featured', label: 'Featured' },
  { value: 'price-low', label: 'Price: Low' },
  { value: 'price-high', label: 'Price: High' },
  { value: 'newest', label: 'Newest' },
];

export default function FilterBar({
  categories,
  selectedCategory,
  onCategoryChange,
  sortBy,
  onSortChange,
}: FilterBarProps) {
  const hasActiveFilters = selectedCategory !== 'All' || sortBy !== 'featured';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {categories.map((cat) => (
            <Button
              key={cat}
              onClick={() => onCategoryChange(cat)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                selectedCategory === cat
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              {cat}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 text-muted-foreground">
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span className="text-xs">Sort:</span>
        </div>
        <div className="flex gap-1 overflow-x-auto scrollbar-hide">
          {sortOptions.map((opt) => (
            <Button
              key={opt.value}
              onClick={() => onSortChange(opt.value)}
              className={`shrink-0 px-2.5 py-1 rounded-lg text-xs transition-all duration-200 ${
                sortBy === opt.value
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt.label}
            </Button>
          ))}
        </div>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { onCategoryChange('All'); onSortChange('featured'); }}
            className="text-xs text-muted-foreground h-7 px-2 ml-auto"
          >
            <X className="w-3 h-3 mr-1" />
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}