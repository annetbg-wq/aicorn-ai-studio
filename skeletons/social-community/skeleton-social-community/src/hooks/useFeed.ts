import { useCallback, useMemo, useState } from 'react';
import type { Post } from '@/data/types';

interface UseFeedInput {
  source: readonly Post[];
  pageSize?: number;
}

interface UseFeedResult {
  posts: readonly Post[];
  hasMore: boolean;
  loadMore: () => void;
  /** Optimistic like toggle — rolls back if onPersist throws. */
  toggleLike: (postId: string, onPersist?: (next: boolean) => Promise<void>) => Promise<void>;
}

/**
 * Local feed state with pagination and optimistic like toggles.
 * Pure — no fetching. Agent wires real persistence via `onPersist`.
 */
export function useFeed({ source, pageSize = 5 }: UseFeedInput): UseFeedResult {
  const [page, setPage] = useState(1);
  const [overrides, setOverrides] = useState<Record<string, { liked: boolean; likes: number }>>({});

  const visible = useMemo(() => {
    const slice = source.slice(0, page * pageSize);
    return slice.map((post) => {
      const o = overrides[post.id];
      return o ? { ...post, liked: o.liked, likes: o.likes } : post;
    });
  }, [source, page, pageSize, overrides]);

  const hasMore = page * pageSize < source.length;

  const loadMore = useCallback(() => {
    if (hasMore) setPage((p) => p + 1);
  }, [hasMore]);

  const toggleLike = useCallback(
    async (postId: string, onPersist?: (next: boolean) => Promise<void>): Promise<void> => {
      const post = source.find((p) => p.id === postId);
      if (!post) return;
      const current = overrides[postId] ?? { liked: post.liked, likes: post.likes };
      const next = { liked: !current.liked, likes: current.likes + (current.liked ? -1 : 1) };

      setOverrides((prev) => ({ ...prev, [postId]: next }));
      if (!onPersist) return;
      try {
        await onPersist(next.liked);
      } catch {
        // rollback
        setOverrides((prev) => ({ ...prev, [postId]: current }));
      }
    },
    [source, overrides],
  );

  return { posts: visible, hasMore, loadMore, toggleLike };
}
