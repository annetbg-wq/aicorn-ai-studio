import { Skeleton } from './ui/Skeleton';

/**
 * Full-viewport branded loading state.
 * Used for first-paint and lazy-route fallback while chunks load.
 *
 * Pattern for list pages (PRODUCT: copy this when wiring real fetches):
 *   if (state === 'loading') return <SkeletonList />;
 *   if (items.length === 0) return <EmptyState ... />;
 *   return <List items={items} />;
 */
export function LoadingScreen(): JSX.Element {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="flex min-h-full flex-col gap-6 px-6 pt-10"
    >
      <div className="space-y-2">
        <Skeleton className="h-7 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    </div>
  );
}
