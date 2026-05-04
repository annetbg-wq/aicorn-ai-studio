import { Link } from 'react-router-dom';
import { UserAvatar } from './UserAvatar';
import { profileRoute } from '@/config/routes';
import type { Comment, User } from '@/data/types';

interface CommentItemProps {
  comment: Comment;
  author: User;
}

const RELATIVE_FMT = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 60) return RELATIVE_FMT.format(-min, 'minute');
  const hr = Math.round(min / 60);
  if (hr < 24) return RELATIVE_FMT.format(-hr, 'hour');
  const day = Math.round(hr / 24);
  return RELATIVE_FMT.format(-day, 'day');
}

export function CommentItem({ comment, author }: CommentItemProps): JSX.Element {
  return (
    <li className="flex gap-3 py-3">
      <Link to={profileRoute(author.id)} aria-label={`${author.name} profile`}>
        <UserAvatar user={author} size="sm" />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <Link
            to={profileRoute(author.id)}
            className="text-sm font-medium hover:underline"
          >
            {author.name}
          </Link>
          <span className="text-xs text-muted-foreground">{relativeTime(comment.createdAt)}</span>
        </div>
        <p className="mt-0.5 text-sm leading-relaxed">{comment.body}</p>
      </div>
    </li>
  );
}
