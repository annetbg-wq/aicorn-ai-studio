import { Github, Twitter, Linkedin } from 'lucide-react';
import { APP_CONFIG } from '@/config/app';
import { FOOTER_COLUMNS } from '@/data/content';

const SOCIAL = [
  { href: '#', label: 'Twitter', icon: Twitter },
  { href: '#', label: 'GitHub', icon: Github },
  { href: '#', label: 'LinkedIn', icon: Linkedin },
];

export function Footer(): JSX.Element {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-card px-4 py-12">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-5">
          <div className="col-span-2 md:col-span-1">
            <p className="text-base font-semibold tracking-tight">{APP_CONFIG.name}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {/* PRODUCT: replace with brand line. */}
              Calm tools for shipping software.
            </p>
            <div className="mt-4 flex gap-2">
              {SOCIAL.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  aria-label={s.label}
                  className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <s.icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          {FOOTER_COLUMNS.map((col) => (
            <div key={col.heading}>
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {col.heading}
              </h3>
              <ul className="mt-3 space-y-2">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-foreground transition-colors hover:text-primary"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-2 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <p>
            © {year} {APP_CONFIG.name}. All rights reserved.
          </p>
          <p>Built with care.</p>
        </div>
      </div>
    </footer>
  );
}
