export interface FooterLink {
  label: string;
  href: string;
}

export interface FooterSection {
  title: string;
  links: FooterLink[];
}

const DEFAULT_SECTIONS: FooterSection[] = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '#' },
      { label: 'Pricing', href: '#' },
      { label: 'Changelog', href: '#' },
      { label: 'Roadmap', href: '#' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '#' },
      { label: 'Blog', href: '#' },
      { label: 'Careers', href: '#' },
      { label: 'Press', href: '#' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy', href: '#' },
      { label: 'Terms', href: '#' },
      { label: 'Cookies', href: '#' },
      { label: 'Security', href: '#' },
    ],
  },
];

export function Footer({
  brand = 'Acme',
  tagline = 'Building the future, one component at a time.',
  sections = DEFAULT_SECTIONS,
  copyright,
}: {
  brand?: string;
  tagline?: string;
  sections?: FooterSection[];
  copyright?: string;
}) {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 px-4 py-12 md:grid-cols-4">
        {/* Brand column */}
        <div className="col-span-2 flex flex-col gap-2 md:col-span-1">
          <span className="text-lg font-bold text-foreground">{brand}</span>
          <p className="text-sm leading-relaxed text-muted-foreground">{tagline}</p>
        </div>

        {/* Link columns */}
        {sections.map((section) => (
          <div key={section.title} className="flex flex-col gap-3">
            <h4 className="text-sm font-semibold text-foreground">{section.title}</h4>
            <ul className="flex flex-col gap-2">
              {section.links.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-border">
        <p className="mx-auto max-w-5xl px-4 py-4 text-xs text-muted-foreground">
          {copyright ?? `© ${year} ${brand}. All rights reserved.`}
        </p>
      </div>
    </footer>
  );
}
