import { Heart, MessageCircle, Share2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from './ui/Card';
import { UserAvatar } from './UserAvatar';
import { Badge } from './ui/Badge';
import { postRoute, profileRoute } from '@/config/routes';
import { cn } from '@/lib/cn';
import type { Post, User } from '@/data/types';

interface PostCardProps {
  post: Post;
  author: User;
  onLike: (postId: string) => void;
}

const RELATIVE_FMT = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const NUM_FMT = new Intl.NumberFormat(undefined, { notation: 'compact' });

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 60) return RELATIVE_FMT.format(-min, 'minute');
  const hr = Math.round(min / 60);
  if (hr < 24) return RELATIVE_FMT.format(-hr, 'hour');
  const day = Math.round(hr / 24);
  return RELATIVE_FMT.format(-day, 'day');
}

const GRADIENT_BY_KEY: Record<string, string> = {
  'gradient-1': 'bg-gradient-to-br from-primary/30 via-violet/20 to-rose/20',
  'gradient-2': 'bg-gradient-to-br from-success/30 via-primary/20 to-warning/20',
};

export function PostCard({ post, author, onLike }: PostCardProps): JSX.Element {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <header className="flex items-center gap-3 p-3">
          <Link to={profileRoute(author.id)} aria-label={`${author.name} profile`}>
            <UserAvatar user={author} size="md" />
          </Link>
          <div className="min-w-0 flex-1">
            <Link
              to={profileRoute(author.id)}
              className="text-sm font-medium hover:underline"
            >
              {author.name}
            </Link>
            <p className="text-xs text-muted-foreground">
              @{author.handle} · {relativeTime(post.createdAt)}
            </p>
          </div>
          {post.tag && <Badge variant="secondary">{post.tag}</Badge>}
        </header>

        {post.kind === 'photo' && post.imageUrl && (
          <Link to={postRoute(post.id)} aria-label="Open post">
            <div
              className={cn(
                'aspect-[4/5] w-full',
                GRADIENT_BY_KEY[post.imageUrl] ?? 'bg-muted',
              )}
              role="img"
              aria-label="Post photo"
            />
          </Link>
        )}

        {post.body && (
          <div className="px-3 pt-3">
            <Link to={postRoute(post.id)} className="block text-sm leading-relaxed hover:underline">
              {post.body}
            </Link>
          </div>
        )}

        <footer className="flex items-center gap-1 px-2 py-2">
          <ActionButton
            icon={Heart}
            label={NUM_FMT.format(post.likes)}
            active={post.liked}
            activeClass="text-rose"
            onClick={() => onLike(post.id)}
            ariaLabel={post.liked ? 'Unlike' : 'Like'}
          />
          <Link
            to={postRoute(post.id)}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Comments"
          >
            <MessageCircle className="h-4 w-4" />
            {NUM_FMT.format(post.comments)}
          </Link>
          <ActionButton
            icon={Share2}
            label="Share"
            onClick={() => {
              /* PRODUCT: wire native share or copy link. */
            }}
            ariaLabel="Share post"
          />
        </footer>
      </CardContent>
    </Card>
  );
}

interface ActionButtonProps {
  icon: typeof Heart;
  label: string;
  active?: boolean;
  activeClass?: string;
  onClick: () => void;
  ariaLabel: string;
}

function ActionButton({
  icon: Icon,
  label,
  active,
  activeClass,
  onClick,
  ariaLabel,
}: ActionButtonProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
        'hover:bg-muted',
        active ? activeClass : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon
        className={cn('h-4 w-4 transition-transform', active && 'scale-110')}
        fill={active ? 'currentColor' : 'none'}
      />
      {label}
    </button>
  );
}
