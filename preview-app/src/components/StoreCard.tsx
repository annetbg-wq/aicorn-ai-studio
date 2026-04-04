import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { Store } from '../data/stores';

export default function StoreCard({ store }: { store: Store }) {
  return (
    <Link
      to={`/store/${store.id}`}
      className="block group animate-in fade-in slide-in-from-bottom-2 duration-300"
    >
      <div className="bg-card rounded-2xl border border-border p-4 transition-all duration-200 hover:shadow-md hover:border-primary/30 active:scale-[0.98]">
        <div className="flex items-start gap-3">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-foreground font-bold text-lg shrink-0 shadow-sm"
            style={{ backgroundColor: store.color }}
          >
            {store.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-foreground truncate">{store.name}</h3>
              {store.isARPartner && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium shrink-0">
                  <Sparkles className="w-2.5 h-2.5" />
                  AR
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground line-clamp-1 mt-0.5">{store.description}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{store.category}</span>
              <span className="text-xs text-muted-foreground">{store.arItemCount.toLocaleString()} AR items</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}