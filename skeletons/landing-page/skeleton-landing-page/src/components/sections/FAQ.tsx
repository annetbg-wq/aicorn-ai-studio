import { useState } from 'react';
import { Plus, Minus } from 'lucide-react';
import { FAQ as FAQ_ITEMS } from '@/data/content';
import { cn } from '@/lib/cn';

export function FAQ(): JSX.Element {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <section id="faq" aria-labelledby="faq-heading" className="bg-muted/30 px-4 py-20">
      <div className="mx-auto max-w-3xl">
        <header className="text-center">
          <h2 id="faq-heading" className="text-3xl font-semibold tracking-tight md:text-4xl">
            Frequently asked questions
          </h2>
        </header>

        <ul className="mt-10 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {FAQ_ITEMS.map((item, i) => {
            const open = openIndex === i;
            const Icon = open ? Minus : Plus;
            return (
              <li key={item.q}>
                <button
                  type="button"
                  onClick={() => setOpenIndex(open ? -1 : i)}
                  aria-expanded={open}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/50"
                >
                  <span className="font-medium">{item.q}</span>
                  <Icon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                </button>
                <div
                  className={cn(
                    'grid transition-all duration-200',
                    open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
                  )}
                >
                  <div className="overflow-hidden">
                    <p className="px-5 pb-4 text-sm text-muted-foreground">{item.a}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
