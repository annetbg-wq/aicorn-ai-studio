import { motion } from 'framer-motion';
import { Inbox, Loader2 } from 'lucide-react';
import { useFeed } from '@/hooks/useFeed';
import { useApp } from '@/context/AppContext';
import { PostCard } from '@/components/PostCard';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { SEED_POSTS, SEED_USERS } from '@/data/seed';
import { APP_CONFIG } from '@/config/app';

export default function Feed(): JSX.Element {
  const { loadingState } = useApp();
  const feed = useFeed({ source: SEED_POSTS, pageSize: 4 });

  const userById = new Map(SEED_USERS.map((u) => [u.id, u]));

  return (
    <div className="flex min-h-full flex-col safe-top">
      <header className="border-b border-border bg-card/95 px-5 py-3 backdrop-blur sticky top-0 z-20">
        <h1 className="text-lg font-semibold tracking-tight">{APP_CONFIG.name}</h1>
      </header>

      <main className="flex-1 px-3 pb-32 pt-3">
        {loadingState === 'loading' ? (
          <FeedSkeleton />
        ) : feed.posts.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="Your feed is quiet"
            description="Follow a few people to see their posts here."
          />
        ) : (
          <ul className="space-y-3">
            {feed.posts.map((post, i) => {
              const author = userById.get(post.authorId);
              if (!author) return null;
              return (
                <motion.li
                  key={post.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: i * 0.04, ease: 'easeOut' }}
                >
                  <PostCard post={post} author={author} onLike={(id) => feed.toggleLike(id)} />
                </motion.li>
              );
            })}
          </ul>
        )}

        {feed.hasMore && (
          <div className="flex justify-center pt-4">
            <Button variant="outline" size="sm" onClick={feed.loadMore}>
              <Loader2 className="h-3 w-3" />
              Load more
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}

function FeedSkeleton(): JSX.Element {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-3 rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-2 w-1/4" />
            </div>
          </div>
          <Skeleton className="h-20 w-full" />
        </div>
      ))}
    </div>
  );
}
