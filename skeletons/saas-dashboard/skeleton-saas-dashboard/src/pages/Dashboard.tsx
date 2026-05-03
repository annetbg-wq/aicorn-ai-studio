import { motion } from 'framer-motion';
import { useApp } from '@/context/AppContext';
import { KPICard } from '@/components/KPICard';
import { Sparkline } from '@/components/Sparkline';
import { OnboardingChecklist } from '@/components/OnboardingChecklist';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Avatar, AvatarFallback } from '@/components/ui/Avatar';
import { SEED_KPIS, SEED_SPARKLINE, SEED_ACTIVITY } from '@/data/seed';

const TIME_FMT = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
});

export default function Dashboard(): JSX.Element {
  const { profile } = useApp();

  return (
    <div className="space-y-6 p-6">
      <header>
        <p className="text-sm text-muted-foreground">Welcome back, {profile.name.split(' ')[0]}</p>
        {/* PRODUCT: replace with a real dashboard tagline. */}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Workspace overview</h1>
      </header>

      <OnboardingChecklist />

      <section
        aria-label="Key metrics"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        {SEED_KPIS.map((metric, i) => (
          <motion.div
            key={metric.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: i * 0.05, ease: 'easeOut' }}
          >
            <KPICard metric={metric} />
          </motion.div>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Activity</CardTitle>
            {/* PRODUCT: replace metric description. */}
            <CardDescription>Last 12 weeks</CardDescription>
          </CardHeader>
          <CardContent>
            <Sparkline data={SEED_SPARKLINE} height={120} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Latest events from your team</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {SEED_ACTIVITY.map((event) => (
                <li key={event.id} className="flex gap-3">
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarFallback className="text-xs">
                      {event.actor[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-tight">
                      <span className="font-medium">{event.actor}</span>{' '}
                      <span className="text-muted-foreground">{event.action}</span>{' '}
                      <span className="font-medium">{event.target}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {TIME_FMT.format(new Date(event.timestamp))}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
