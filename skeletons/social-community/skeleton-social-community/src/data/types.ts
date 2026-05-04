import type { ThemeChoice } from '@/config/theme';

export type ID = string;
export type LoadingState = 'idle' | 'loading' | 'ready' | 'error';

export interface User {
  id: ID;
  name: string;
  handle: string;
  bio: string;
  /** Optional explicit avatar; otherwise the fallback is name initial. */
  avatarUrl?: string;
  followers: number;
  following: number;
  posts: number;
}

export type PostKind = 'text' | 'photo' | 'link';

export interface Post {
  id: ID;
  authorId: ID;
  /** Body text, may be empty for pure-photo posts. */
  body: string;
  kind: PostKind;
  /** Optional image URL — placeholder gradient if absent. */
  imageUrl?: string;
  /** ISO timestamp. */
  createdAt: string;
  likes: number;
  /** Whether the current viewer has liked it. */
  liked: boolean;
  comments: number;
  /** Optional category tag for Explore filters. */
  tag?: string;
}

export interface Comment {
  id: ID;
  postId: ID;
  authorId: ID;
  body: string;
  createdAt: string;
}

export type NotificationType = 'like' | 'comment' | 'follow' | 'mention';

export interface Notification {
  id: ID;
  type: NotificationType;
  actorId: ID;
  /** Reference target — postId or userId depending on `type`. */
  targetId: ID;
  createdAt: string;
  read: boolean;
}

export type { ThemeChoice };
