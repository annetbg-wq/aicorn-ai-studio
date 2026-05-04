import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Inbox } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/EmptyState';
import { postRoute } from '@/config/routes';
import { SEED_POSTS, SEED_USERS, EXPLORE_TAGS } from '@/data/seed';
import { cn } from '@/lib/cn';

const GRADIENT_BY_KEY: Record<string, string> = {
  'gradient-1': 'bg-gradient-to-br from-primary/30 via-violet/20 to-rose/20',
  'gradient-2': 'bg-gradient-to-br from-success/30 via-primary/20 to-warning/20',
};

export default function Explore(): JSX.Element {
  const [tag, setTag] = useState<string>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SEED_POSTS.filter((p) => {
      if (tag !== 'all' && p.tag !== tag) return false;
      if (q && !p.body.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tag, query]);

  const userById = new Map(SEED_USERS.map((u) => [u.id, u]));

  return (
    <div className="flex min-h-full flex-col safe-top">
      <header className="space-y-3 px-5 pb-3 pt-6">
        <h1 className="text-2xl font-semibold tracking-tight">Explore</h1>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search posts..."
            className="pl-9"
            aria-label="Search posts"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {EXPLORE_TAGS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTag(t)}
              className={cn(
                'flex-shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                tag === t
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-muted-foreground hover:bg-muted',
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 px-3 pb-32">
        {filtered.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No posts match"
            description="Try a different tag or search term."
          />
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {filtered.map((post) => {
              const author = userById.get(post.authorId);
              return (
                <Link
                  key={post.id}
                  to={postRoute(post.id)}
                  className={cn(
                    'group relative aspect-square overflow-hidden rounded-md',
                    post.kind === 'photo' && post.imageUrl
                      ? GRADIENT_BY_KEY[post.imageUrl] ?? 'bg-muted'
                      : 'bg-muted',
                  )}
                >
                  {post.kind === 'text' && (
                    <div className="flex h-full flex-col justify-end p-3 text-xs text-foreground/90">
                      <span className="line-clamp-3 font-medium">{post.body}</span>
                      {author && (
                        <span className="mt-1 text-[10px] text-muted-foreground">
                          @{author.handle}
                        </span>
                      )}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
