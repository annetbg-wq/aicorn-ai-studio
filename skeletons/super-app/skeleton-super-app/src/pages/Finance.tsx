import { useMemo, useState } from 'react';
import { DOMAIN_ACTIVITY } from '@/data/seed';

export default function Finance(): JSX.Element {
  const initial = useMemo(() => DOMAIN_ACTIVITY.filter(item => item.domain === 'finance'), []);
  const [entries, setEntries] = useState(() => [...initial]);
  const [amount, setAmount] = useState('18');
  const total = entries.reduce((sum, item) => sum + item.value, 0);
  return <section className="space-y-4 p-6 pb-24"><h1 className="text-2xl font-semibold">Money</h1><p>Tracked spending: ${total}</p><label className="block text-sm">Expense amount<input aria-label="Expense amount" className="mt-1 w-full rounded-xl border p-3" value={amount} onChange={event => setAmount(event.target.value)} /></label><button className="rounded-xl bg-primary px-4 py-2 text-primary-foreground" onClick={() => setEntries(current => [...current, { id: `local-${current.length}`, domain: 'finance', title: 'Quick expense', value: Number(amount) || 0, unit: 'USD' }])}>Add expense</button><p>Entries: {entries.length}</p></section>;
}
