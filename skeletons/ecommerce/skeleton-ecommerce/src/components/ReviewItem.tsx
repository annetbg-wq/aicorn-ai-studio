import { RatingStars } from './RatingStars';
import { Avatar, AvatarFallback } from './ui/Avatar';
import type { Review } from '@/data/types';

interface ReviewItemProps {
  review: Review;
}

const DATE_FMT = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

export function ReviewItem({ review }: ReviewItemProps): JSX.Element {
  return (
    <article className="flex gap-3 py-4">
      <Avatar className="h-9 w-9 flex-shrink-0">
        <AvatarFallback className="text-xs">{review.author[0]?.toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <header className="flex items-baseline gap-2">
          <span className="text-sm font-medium">{review.author}</span>
          <RatingStars value={review.rating} />
          <span className="ml-auto text-xs text-muted-foreground">
            {DATE_FMT.format(new Date(review.createdAt))}
          </span>
        </header>
        <h4 className="mt-1 text-sm font-medium">{review.title}</h4>
        <p className="mt-1 text-sm text-muted-foreground">{review.body}</p>
      </div>
    </article>
  );
}
