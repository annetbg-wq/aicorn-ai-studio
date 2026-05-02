import { type ReactNode } from 'react';

export interface LogoItem {
  name: string;
  /** Pass an <img>, <svg>, or text node */
  logo?: ReactNode;
  src?: string;
}

const DEFAULT_LOGOS: LogoItem[] = [
  { name: 'Acme',     logo: <span className="text-xl font-bold tracking-tight">Acme</span> },
  { name: 'Globex',   logo: <span className="text-xl font-bold tracking-tight">Globex</span> },
  { name: 'Initech',  logo: <span className="text-xl font-bold tracking-tight">Initech</span> },
  { name: 'Umbrella', logo: <span className="text-xl font-bold tracking-tight">Umbrella</span> },
  { name: 'Vehement', logo: <span className="text-xl font-bold tracking-tight">Vehement</span> },
  { name: 'Hooli',    logo: <span className="text-xl font-bold tracking-tight">Hooli</span> },
];

export function Logos({
  title = 'Trusted by teams at world-class companies',
  items = DEFAULT_LOGOS,
}: {
  title?: string;
  items?: LogoItem[];
}) {
  return (
    <section className="bg-background py-16 px-4">
      <div className="mx-auto max-w-4xl text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {title}
        </p>

        <div className="mt-10 grid grid-cols-2 items-center justify-items-center gap-8 sm:grid-cols-3 md:grid-cols-6">
          {items.map((item) => (
            <div
              key={item.name}
              title={item.name}
              className="text-muted-foreground opacity-50 transition-opacity hover:opacity-100"
            >
              {item.logo
                ?? (item.src
                  ? <img src={item.src} alt={item.name} className="h-8 w-auto object-contain" />
                  : <span className="text-xl font-bold tracking-tight">{item.name}</span>)}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
