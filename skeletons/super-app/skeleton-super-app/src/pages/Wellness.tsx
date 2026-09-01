import { useState } from 'react';
import { DOMAIN_ACTIVITY } from '@/data/seed';

export default function Wellness(): JSX.Element {
  const seed = DOMAIN_ACTIVITY.find(item => item.domain === 'wellness');
  const [water, setWater] = useState(seed?.value ?? 0);
  return <section className="space-y-4 p-6 pb-24"><h1 className="text-2xl font-semibold">Wellness</h1><p>Hydration today: {water} glasses</p><button className="rounded-xl bg-primary px-4 py-2 text-primary-foreground" onClick={() => setWater(value => value + 1)}>Log water</button><p>{water >= 8 ? 'Hydration goal reached' : `${8 - water} glasses to goal`}</p></section>;
}
