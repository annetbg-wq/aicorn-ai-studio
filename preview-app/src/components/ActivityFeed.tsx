import { UserPlus, ShoppingCart, RefreshCw, CreditCard } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { ActivityItem } from '@/data/seedData';
import { getRelativeTime } from '@/lib/formatters';

interface ActivityFeedProps {
  items: ActivityItem[];
  loading?: boolean;
}

const typeConfig: Record<ActivityItem['type'], { icon: React.ElementType; color: string; label: string }> = {
  user_signup: { icon: UserPlus, color: 'text-blue-500', label: 'Sign-up' },
  purchase: { icon: ShoppingCart, color: 'text-emerald-500', label: 'Purchase' },
  subscription: { icon: CreditCard, color: 'text-violet-500', label: 'Subscription' },
  refund: { icon: RefreshCw, color: 'text-amber-500', label: 'Refund' },
};

export default function ActivityFeed({ items, loading }: ActivityFeedProps) {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-foreground">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="px-6 pb-6 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <span className="text-4xl mb-3 opacity-20">📋</span>
            <p className="text-sm font-medium">No recent activity</p>
            <p className="text-xs mt-1">Activity will appear here as it happens</p>
          </div>
        ) : (
          <div className="max-h-[420px] overflow-y-auto">
            {items.map((item, index) => {
              const config = typeConfig[item.type];
              const Icon = config.icon;

              return (
                <div
                  key={item.id}
                  className={`flex items-start gap-3 px-6 py-3.5 hover:bg-muted/30 transition-colors ${
                    index !== items.length - 1 ? 'border-b border-border' : ''
                  }`}
                >
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarFallback className="bg-muted text-muted-foreground text-xs font-medium">
                      {item.userAvatar || '??'}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Icon className={`h-3.5 w-3.5 ${config.color} shrink-0`} />
                      <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
                    </div>
                    <p
                      className="text-sm text-foreground line-clamp-2 leading-relaxed"
                      title={item.description}
                    >
                      {item.description}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {getRelativeTime(item.timestamp)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}