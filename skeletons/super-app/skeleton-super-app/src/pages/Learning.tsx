import { useMemo, useState } from 'react';
import { DOMAIN_ACTIVITY } from '@/data/seed';

export default function Learning(): JSX.Element {
  const minutes = useMemo(() => DOMAIN_ACTIVITY.filter(item => item.domain === 'learning').reduce((sum, item) => sum + item.value, 0), []);
  const [sessions, setSessions] = useState(1);
  return <section className="space-y-4 p-6 pb-24"><h1 className="text-2xl font-semibold">Learning</h1><p>Practice minutes: {minutes}</p><p>Sessions today: {sessions}</p><button className="rounded-xl bg-primary px-4 py-2 text-primary-foreground" onClick={() => setSessions(value => value + 1)}>Complete practice</button></section>;
}
