import React from 'react';

interface FeedItemProps {
  author: { name: string; avatar?: string; handle?: string };
  timestamp: string;
  content: string;
  image?: string;
  actions?: {
    likes?: number;
    comments?: number;
    reposts?: number;
    liked?: boolean;
  };
  className?: string;
}

export function FeedItem({ author, timestamp, content, image, actions, className = '' }: FeedItemProps) {
  const initials = author.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  return (
    <article className={[
      'flex gap-3 px-4 py-4 border-b border-[--vb-border]',
      'hover:bg-[--vb-bg-alt] transition-colors duration-150',
      className,
    ].join(' ')}>
      <div className="w-10 h-10 rounded-full bg-[--vb-accent] flex items-center justify-center text-[--vb-accent-fg] font-semibold text-sm shrink-0 overflow-hidden">
        {author.avatar
          ? <img src={author.avatar} alt={author.name} className="w-full h-full object-cover" />
          : initials
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold text-[--vb-text]">{author.name}</span>
          {author.handle && <span className="text-xs text-[--vb-text-muted]">@{author.handle}</span>}
          <span className="text-xs text-[--vb-text-subtle] ml-auto">{timestamp}</span>
        </div>
        <p className="text-sm text-[--vb-text] leading-relaxed whitespace-pre-wrap">{content}</p>
        {image && (
          <div className="mt-3 rounded-[--vb-radius-md] overflow-hidden border border-[--vb-border]">
            <img src={image} alt="" className="w-full object-cover max-h-64" />
          </div>
        )}
        {actions && (
          <div className="flex items-center gap-5 mt-3 text-[--vb-text-muted]">
            {actions.likes !== undefined && (
              <button className={[
                'flex items-center gap-1.5 text-xs hover:text-[--vb-danger] transition-colors',
                actions.liked ? 'text-[--vb-danger]' : '',
              ].join(' ')}>
                <span>{actions.liked ? '♥' : '♡'}</span>
                <span>{actions.likes}</span>
              </button>
            )}
            {actions.comments !== undefined && (
              <button className="flex items-center gap-1.5 text-xs hover:text-[--vb-info] transition-colors">
                <span>💬</span>
                <span>{actions.comments}</span>
              </button>
            )}
            {actions.reposts !== undefined && (
              <button className="flex items-center gap-1.5 text-xs hover:text-[--vb-success] transition-colors">
                <span>↩</span>
                <span>{actions.reposts}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
