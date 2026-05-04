import { useParams } from 'react-router-dom';
import { Inbox } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { UserAvatar } from '@/components/UserAvatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/EmptyState';
import { SEED_POSTS, SEED_USERS } from '@/data/seed';
import { cn } from '@/lib/cn';
import type { User } from '@/data/types';

const NUM_FMT = new Intl.NumberFormat(undefined, { notation: 'compact' });

const GRADIENT_BY_KEY: Record<string, string> = {
  'gradient-1': 'bg-gradient-to-br from-primary/30 via-violet/20 to-rose/20',
  'gradient-2': 'bg-gradient-to-br from-success/30 via-primary/20 to-warning/20',
};

export default function Profile(): JSX.Element {
  const { userId } = useParams<{ userId?: string }>();
  const { currentUser, isFollowing, toggleFollow } = useApp();

  /* SEED: replace with real user lookup. */
  const user: User | undefined =
    !userId || userId === currentUser.id
      ? currentUser
      : SEED_USERS.find((u) => u.id === userId);

  if (!user) {
    return (
      <div className="flex min-h-full items-center justify-center safe-top">
        <EmptyState icon={Inbox} title="Profile not found" />
      </div>
    );
  }

  const isMe = user.id === currentUser.id;
  const following = !isMe && isFollowing(user.id);
  const userPosts = SEED_POSTS.filter((p) => p.authorId === user.id);

  return (
    <div className="flex min-h-full flex-col safe-top">
      <header className="border-b border-border px-5 pb-5 pt-6">
        <div className="flex items-start gap-4">
          <UserAvatar user={user} size="xl" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold tracking-tight">{user.name}</h1>
            <p className="text-sm text-muted-foreground">@{user.handle}</p>
            {user.bio && <p className="mt-2 text-sm leading-relaxed">{user.bio}</p>}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-6 text-sm">
          <Stat label="Posts" value={user.posts} />
          <Stat label="Followers" value={user.followers} />
          <Stat label="Following" value={user.following} />
        </div>

        <div className="mt-4">
          {isMe ? (
            <Button variant="outline" size="sm" className="w-full">
              Edit profile
            </Button>
          ) : (
            <Button
              variant={following ? 'outline' : 'default'}
              size="sm"
              className="w-full"
              onClick={() => toggleFollow(user.id)}
            >
              {following ? 'Following' : 'Follow'}
            </Button>
          )}
        </div>
      </header>

      <main className="flex-1 px-3 pb-32 pt-3">
        {userPosts.length === 0 ? (
          <EmptyState icon={Inbox} title="No posts yet" />
        ) : (
          <div className="grid grid-cols-3 gap-1">
            {userPosts.map((post) => (
              <div
                key={post.id}
                className={cn(
                  'aspect-square overflow-hidden rounded-sm',
                  post.kind === 'photo' && post.imageUrl
                    ? GRADIENT_BY_KEY[post.imageUrl] ?? 'bg-muted'
                    : 'bg-muted',
                )}
              >
                {post.kind === 'text' && (
                  <div className="flex h-full items-center justify-center p-2 text-center text-[10px] text-muted-foreground">
                    {post.body.slice(0, 60)}...
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

interface StatProps {
  label: string;
  value: number;
}

function Stat({ label, value }: StatProps): JSX.Element {
  return (
    <div>
      <p className="text-base font-semibold tabular-nums">{NUM_FMT.format(value)}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
