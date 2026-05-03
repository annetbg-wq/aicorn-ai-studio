import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { APP_CONFIG } from '@/config/app';
import { NAV_LINKS } from '@/data/content';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

export function Nav(): JSX.Element {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onScroll(): void {
      setScrolled(window.scrollY > 8);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-40 transition-all',
        scrolled
          ? 'border-b border-border bg-card/80 backdrop-blur'
          : 'bg-transparent',
      )}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <a href="#top" className="text-base font-semibold tracking-tight">
          {APP_CONFIG.name}
        </a>

        <nav className="hidden gap-1 md:flex" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:block">
          <Button asChild size="sm">
            <a href={APP_CONFIG.primaryCtaHref}>{APP_CONFIG.primaryCtaLabel}</a>
          </Button>
        </div>

        <button
          type="button"
          className="rounded-md p-2 text-foreground md:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-border bg-card md:hidden">
          <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
            <Button asChild size="sm" className="mt-2">
              <a href={APP_CONFIG.primaryCtaHref} onClick={() => setOpen(false)}>
                {APP_CONFIG.primaryCtaLabel}
              </a>
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
