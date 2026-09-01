import { Link } from 'react-router-dom';
import { DOMAIN_SUMMARIES } from '@/data/seed';
import { ROUTES } from '@/config/routes';

const DOMAIN_ROUTES = {
  finance: ROUTES.finance,
  wellness: ROUTES.wellness,
  learning: ROUTES.learning,
} as const;

export default function Home(): JSX.Element {
  return (
    <section className="space-y-5 p-6 pb-24">
      <div><p className="text-sm text-muted-foreground">Your day</p><h1 className="text-2xl font-semibold">Life hub</h1></div>
      <div className="grid gap-3">
        {DOMAIN_SUMMARIES.map(domain => (
          <Link key={domain.id} to={DOMAIN_ROUTES[domain.id]} className="rounded-2xl border bg-card p-4">
            <div className="flex items-start justify-between gap-4">
              <div><h2 className="font-semibold">{domain.title}</h2><p className="text-sm text-muted-foreground">{domain.subtitle}</p></div>
              <div className="text-right"><p className="text-xs text-muted-foreground">{domain.metricLabel}</p><strong>{domain.metricValue}</strong></div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
