# Social / Community Skeleton

Production-grade React + TypeScript skeleton for feed-driven social products.

## Layout

5 bottom tabs: Feed · Explore · Create (elevated) · Notifications (with unread badge) · You.

## Pages

- **Feed** — paginated feed with optimistic likes
- **Explore** — masonry-style grid + category chips + search
- **Create** — 2-step compose → preview → publish flow
- **Notifications** — grouped activity, auto-marks-read on view
- **Profile** — bio + stats + grid (own profile + others)
- **PostDetail** — single post + comments thread + reply input

## What's wired

- `useFeed` — pagination + optimistic like toggle (rolls back on persist failure)
- Notification badge on the bell tab
- Follow / unfollow with persisted state
- Relative time formatting via `Intl.RelativeTimeFormat`
- All 11 UI primitives + 4 domain components (PostCard, CommentItem, NotificationItem, UserAvatar)

## Running

```bash
npm install
npm run dev
npm run typecheck
npm run validate
npm run build
```

## Customization

1. Edit `src/config/app.ts` — name and tagline.
2. Replace `src/data/seed.ts` with real users / posts / comments / notifications.
3. Wire `onPersist` callbacks in `useFeed.toggleLike` to your backend.
4. Replace gradient placeholders in PostCard / Profile with real images.
