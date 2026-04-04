import { Button } from "@/components/ui/button";
import { Clock, DollarSign, Leaf, Bookmark, BookmarkCheck, ChevronDown, ChevronUp } from 'lucide-react';
import { Route } from '../data/seed';
import { Button } from './ui/button';

interface RouteCardProps {
  route: Route;
  isExpanded: boolean;
  onToggle: () => void;
  onSave: () => void;
  index: number;
}

export default function RouteCard({ route, isExpanded, onToggle, onSave, index }: RouteCardProps) {
  return (
    <div
      className="animate-in fade-in slide-in-from-bottom-2 duration-300"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div
        className={`bg-card border border-border rounded-xl overflow-hidden transition-all duration-200 ${
          isExpanded ? 'ring-2 ring-primary/40' : 'hover:border-border/80 hover:shadow-md'
        }`}
      >
        <Button
          onClick={onToggle}
          className="w-full text-left px-4 py-3 flex items-center gap-3 transition-colors hover:bg-accent/5"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground truncate">
                {route.origin} → {route.destination}
              </span>
              {route.isSaved && (
                <BookmarkCheck className="h-3.5 w-3.5 text-primary shrink-0" />
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">via {route.viaLabel}</p>
          </div>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
        </Button>

        <div className="px-4 pb-3 flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-sm font-medium text-foreground">${route.cost.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-blue-400" />
            <span className="text-sm text-foreground">{route.transitTime} days</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Leaf className="h-3.5 w-3.5 text-green-400" />
            <span className="text-sm text-foreground">{route.carbonImpact} kg</span>
          </div>
        </div>

        {isExpanded && (
          <div className="animate-in fade-in duration-200 px-4 pb-4 border-t border-border pt-3">
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <DollarSign className="h-4 w-4 text-emerald-400 mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">Cost</p>
                <p className="text-sm font-bold text-foreground">${route.cost.toLocaleString()}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <Clock className="h-4 w-4 text-blue-400 mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">Transit</p>
                <p className="text-sm font-bold text-foreground">{route.transitTime} days</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <Leaf className="h-4 w-4 text-green-400 mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">CO₂</p>
                <p className="text-sm font-bold text-foreground">{route.carbonImpact} kg</p>
              </div>
            </div>
            <Button
              onClick={(e) => { e.stopPropagation(); onSave(); }}
              variant={route.isSaved ? 'outline' : 'default'}
              className="w-full active:scale-95 transition-transform duration-100"
            >
              {route.isSaved ? (
                <>
                  <BookmarkCheck className="h-4 w-4 mr-2" /> Saved
                </>
              ) : (
                <>
                  <Bookmark className="h-4 w-4 mr-2" /> Save Route
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}