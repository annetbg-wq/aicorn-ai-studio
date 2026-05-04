import { Avatar, AvatarFallback, AvatarImage } from './ui/Avatar';
import { cn } from '@/lib/cn';
import type { User } from '@/data/types';

interface UserAvatarProps {
  user: Pick<User, 'name' | 'avatarUrl'>;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE_CLASS: Record<NonNullable<UserAvatarProps['size']>, string> = {
  sm: 'h-7 w-7 text-[10px]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-12 w-12 text-sm',
  xl: 'h-20 w-20 text-xl',
};

export function UserAvatar({ user, size = 'md', className }: UserAvatarProps): JSX.Element {
  return (
    <Avatar className={cn(SIZE_CLASS[size], className)}>
      {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} />}
      <AvatarFallback>{user.name[0]?.toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}
