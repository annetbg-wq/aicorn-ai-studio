import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PostCard } from '@/components/PostCard';
import { CommentItem } from '@/components/CommentItem';
import { EmptyState } from '@/components/EmptyState';
import { useFeed } from '@/hooks/useFeed';
import { SEED_COMMENTS, SEED_POSTS, SEED_USERS } from '@/data/seed';

export default function PostDetail(): JSX.Element {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const [draft, setDraft] = useState('');

  /* SEED: replace with real post + comments lookup. */
  const userById = new Map(SEED_USERS.map((u) => [u.id, u]));
  const post = SEED_POSTS.find((p) => p.id === postId);
  const feed = useFeed({ source: post ? [post] : [], pageSize: 1 });
  const livePost = feed.posts[0];
  const author = livePost ? userById.get(livePost.authorId) : undefined;
  const comments = SEED_COMMENTS.filter((c) => c.postId === postId);

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    if (!draft.trim()) return;
    /* PRODUCT: persist comment. */
    setDraft('');
  }

  if (!livePost || !author) {
    return (
      <div className="flex min-h-full flex-col safe-top">
        <header className="px-4 pt-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="-ml-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </header>
        <main className="flex flex-1 items-center justify-center pb-24">
          <EmptyState icon={Inbox} title="Post not found" />
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col safe-top">
      <header className="border-b border-border px-4 pb-2 pt-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="-ml-2">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </header>

      <main className="flex-1 px-3 pb-32 pt-3">
        <PostCard post={livePost} author={author} onLike={(id) => feed.toggleLike(id)} />

        <section aria-label="Comments" className="mt-4">
          <h2 className="px-2 pb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Comments ({comments.length})
          </h2>
          {comments.length === 0 ? (
            <EmptyState icon={Inbox} title="Be the first to comment" />
          ) : (
            <ul className="divide-y divide-border px-2">
              {comments.map((c) => {
                const cAuthor = userById.get(c.authorId);
                if (!cAuthor) return null;
                return <CommentItem key={c.id} comment={c} author={cAuthor} />;
              })}
            </ul>
          )}
        </section>
      </main>

      <form
        onSubmit={handleSubmit}
        className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-md gap-2 border-t border-border bg-card/95 p-3 backdrop-blur safe-bottom"
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a comment..."
          maxLength={300}
          aria-label="Comment text"
        />
        <Button type="submit" size="default" disabled={!draft.trim()}>
          Post
        </Button>
      </form>
    </div>
  );
}
