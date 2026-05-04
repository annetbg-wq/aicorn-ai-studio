import { Link } from 'react-router-dom';
import { Heart, MessageCircle, UserPlus, AtSign } from 'lucide-react';
import { UserAvatar } from './UserAvatar';
import { postRoute, profileRoute } from '@/config/routes';
import { cn } from '@/lib/cn';
import type { Notification, User } from '@/data/types';

interface NotificationItemProps {
  notification: Notification;
  actor: User;
}

const ICON: Record<Notification['type'], typeof Heart> = {
  like: Heart,
  comment: MessageCircle,
  follow: UserPlus,
  mention: AtSign,
};

const TONE: Record<Notification['type'], string> = {
  like: 'text-rose',
  comment: 'text-primary',
  follow: 'text-success',
  mention: 'text-violet',
};

const COPY: Record<Notification['type'], string> = {
  like: 'liked your post',
  comment: 'commented on your post',
  follow: 'started following you',
  mention: 'mentioned you in a post',
};

const RELATIVE_FMT = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 60) return RELATIVE_FMT.format(-min, 'minute');
  const hr = Math.round(min / 60);
  if (hr < 24) return RELATIVE_FMT.format(-hr, 'hour');
  return RELATIVE_FMT.format(-Math.round(hr / 24), 'day');
}

export function NotificationItem({ notification, actor }: NotificationItemProps): JSX.Element {
  const Icon = ICON[notification.type];
  const tone = TONE[notification.type];
  const target =
    notification.type === 'follow'
      ? profileRoute(notification.targetId)
      : postRoute(notification.targetId);

  return (
    <Link
      to={target}
      className={cn(
        'flex items-start gap-3 rounded-md p-3 transition-colors hover:bg-muted',
        !notification.read && 'bg-primary/5',
      )}
    >
      <div className="relative flex-shrink-0">
        <UserAvatar user={actor} size="md" />
        <span
          aria-hidden
          className={cn(
            'absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-card bg-card',
            tone,
          )}
        >
          <Icon className="h-3 w-3" fill={notification.type === 'like' ? 'currentColor' : 'none'} />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug">
          <span className="font-medium">{actor.name}</span>{' '}
          <span className="text-muted-foreground">{COPY[notification.type]}</span>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {relativeTime(notification.createdAt)}
        </p>
      </div>
      {!notification.read && (
        <span aria-label="Unread" className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-primary" />
      )}
    </Link>
  );
}
