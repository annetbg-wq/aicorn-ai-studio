import type { Comment, Notification, Post, User } from './types';

/* SEED: replace with real domain entities — keep ids and structure stable. */

export const CURRENT_USER_ID = 'u-1';

export const SEED_USERS: readonly User[] = [
  { id: 'u-1', name: 'Maya Chen',    handle: 'maya',     bio: 'Designing calmer software.',         followers: 1240, following: 312, posts: 4 },
  { id: 'u-2', name: 'Rohan Patel',  handle: 'rohan',    bio: 'Reliability engineer. Plant nerd.',  followers: 832,  following: 184, posts: 2 },
  { id: 'u-3', name: 'Lena Voss',    handle: 'lenav',    bio: 'Pricing, growth, slow mornings.',    followers: 2104, following: 421, posts: 2 },
  { id: 'u-4', name: 'James Olu',    handle: 'james',    bio: 'Brand work. Photography on weekends.', followers: 514, following: 92,  posts: 1 },
  { id: 'u-5', name: 'Aiko Tanaka',  handle: 'aikot',    bio: 'Books, baking, ambient music.',      followers: 678,  following: 201, posts: 1 },
] as const;

export const SEED_POSTS: readonly Post[] = [
  { id: 'p-1', authorId: 'u-2', body: 'Three hours of focus, no notifications. Cleaner output than the last three days combined.', kind: 'text',   createdAt: '2026-04-30T08:30:00Z', likes: 42, liked: false, comments: 5, tag: 'focus' },
  { id: 'p-2', authorId: 'u-3', body: 'New pricing experiment shipped. Already learning things the spreadsheet missed.',            kind: 'text',   createdAt: '2026-04-30T07:12:00Z', likes: 87, liked: true,  comments: 12, tag: 'product' },
  { id: 'p-3', authorId: 'u-4', body: 'Morning walk, golden hour, no caption needed.',                                              kind: 'photo',  imageUrl: 'gradient-1', createdAt: '2026-04-29T19:40:00Z', likes: 156, liked: true, comments: 9,  tag: 'photo' },
  { id: 'p-4', authorId: 'u-1', body: 'A small redesign goes a long way. Less chrome, more content.',                              kind: 'text',   createdAt: '2026-04-29T15:22:00Z', likes: 64, liked: false, comments: 7, tag: 'design' },
  { id: 'p-5', authorId: 'u-5', body: 'New record on the playlist this week. Quietly perfect for late afternoons.',                kind: 'text',   createdAt: '2026-04-29T10:05:00Z', likes: 31, liked: false, comments: 3, tag: 'music' },
  { id: 'p-6', authorId: 'u-2', body: 'Replaced a flaky cron with a queue. Sleep returning to normal.',                            kind: 'text',   createdAt: '2026-04-28T22:18:00Z', likes: 28, liked: false, comments: 4, tag: 'engineering' },
  { id: 'p-7', authorId: 'u-1', body: 'Sketch from this morning — a small visual idea that turned into a full feature.',           kind: 'photo',  imageUrl: 'gradient-2', createdAt: '2026-04-28T11:00:00Z', likes: 92, liked: false, comments: 6, tag: 'design' },
  { id: 'p-8', authorId: 'u-3', body: 'A short note on why the 4-quadrant matrix keeps winning over fancier frameworks.',          kind: 'text',   createdAt: '2026-04-27T17:30:00Z', likes: 118, liked: true,  comments: 14, tag: 'product' },
  { id: 'p-9', authorId: 'u-1', body: 'Reading week. Three short books beat one long one for retention. Discuss.',                  kind: 'text',   createdAt: '2026-04-27T09:14:00Z', likes: 47, liked: false, comments: 11, tag: 'reading' },
  { id: 'p-10', authorId: 'u-1', body: 'New side project notes — taking the slow lane on this one.',                                kind: 'text',   createdAt: '2026-04-26T20:00:00Z', likes: 39, liked: false, comments: 2, tag: 'projects' },
] as const;

export const SEED_COMMENTS: readonly Comment[] = [
  { id: 'c-1',  postId: 'p-1', authorId: 'u-1', body: 'Same — three hours blocked Tuesdays now. Recommend.', createdAt: '2026-04-30T08:42:00Z' },
  { id: 'c-2',  postId: 'p-1', authorId: 'u-3', body: 'What did you use to block notifications?',            createdAt: '2026-04-30T08:55:00Z' },
  { id: 'c-3',  postId: 'p-1', authorId: 'u-5', body: 'Going to try this tomorrow.',                          createdAt: '2026-04-30T09:14:00Z' },
  { id: 'c-4',  postId: 'p-2', authorId: 'u-2', body: 'Curious which segment moved most.',                    createdAt: '2026-04-30T07:30:00Z' },
  { id: 'c-5',  postId: 'p-2', authorId: 'u-1', body: 'Love when the data disagrees politely with the plan.', createdAt: '2026-04-30T07:48:00Z' },
  { id: 'c-6',  postId: 'p-3', authorId: 'u-1', body: 'This light is perfect.',                               createdAt: '2026-04-29T19:55:00Z' },
  { id: 'c-7',  postId: 'p-3', authorId: 'u-5', body: 'Ten out of ten morning.',                              createdAt: '2026-04-29T20:08:00Z' },
  { id: 'c-8',  postId: 'p-4', authorId: 'u-3', body: 'Could not agree more.',                                 createdAt: '2026-04-29T15:40:00Z' },
  { id: 'c-9',  postId: 'p-4', authorId: 'u-4', body: 'Restraint is a feature.',                              createdAt: '2026-04-29T16:01:00Z' },
  { id: 'c-10', postId: 'p-5', authorId: 'u-1', body: 'Adding to the rotation.',                              createdAt: '2026-04-29T10:30:00Z' },
  { id: 'c-11', postId: 'p-6', authorId: 'u-3', body: 'Queue worker recommendations?',                        createdAt: '2026-04-28T22:40:00Z' },
  { id: 'c-12', postId: 'p-7', authorId: 'u-2', body: 'The arrow detail is great.',                           createdAt: '2026-04-28T11:20:00Z' },
  { id: 'c-13', postId: 'p-7', authorId: 'u-4', body: 'Wallpaper material.',                                  createdAt: '2026-04-28T11:35:00Z' },
  { id: 'c-14', postId: 'p-8', authorId: 'u-1', body: 'Saving this.',                                         createdAt: '2026-04-27T17:50:00Z' },
  { id: 'c-15', postId: 'p-8', authorId: 'u-2', body: 'Simple beats fancy almost always.',                    createdAt: '2026-04-27T18:12:00Z' },
  { id: 'c-16', postId: 'p-9', authorId: 'u-5', body: 'Three short books squad reporting in.',                createdAt: '2026-04-27T09:30:00Z' },
  { id: 'c-17', postId: 'p-9', authorId: 'u-3', body: 'It depends on the depth of the long one, no?',         createdAt: '2026-04-27T09:45:00Z' },
  { id: 'c-18', postId: 'p-10', authorId: 'u-2', body: 'Slow lane > sprint to nothing.',                      createdAt: '2026-04-26T20:18:00Z' },
  { id: 'c-19', postId: 'p-2', authorId: 'u-4', body: 'Love hearing more on this.',                           createdAt: '2026-04-30T07:55:00Z' },
  { id: 'c-20', postId: 'p-1', authorId: 'u-2', body: 'Will share my exact setup tomorrow.',                  createdAt: '2026-04-30T09:30:00Z' },
] as const;

export const SEED_NOTIFICATIONS: readonly Notification[] = [
  { id: 'n-1', type: 'like',    actorId: 'u-3', targetId: 'p-4', createdAt: '2026-04-30T11:42:00Z', read: false },
  { id: 'n-2', type: 'comment', actorId: 'u-2', targetId: 'p-9', createdAt: '2026-04-30T10:15:00Z', read: false },
  { id: 'n-3', type: 'follow',  actorId: 'u-5', targetId: 'u-1', createdAt: '2026-04-30T09:33:00Z', read: false },
  { id: 'n-4', type: 'like',    actorId: 'u-4', targetId: 'p-7', createdAt: '2026-04-29T18:02:00Z', read: true },
  { id: 'n-5', type: 'comment', actorId: 'u-3', targetId: 'p-9', createdAt: '2026-04-29T14:21:00Z', read: true },
  { id: 'n-6', type: 'mention', actorId: 'u-2', targetId: 'p-1', createdAt: '2026-04-29T11:04:00Z', read: true },
] as const;

export const EXPLORE_TAGS: readonly string[] = [
  'all',
  'design',
  'product',
  'engineering',
  'photo',
  'reading',
  'music',
  'focus',
] as const;
