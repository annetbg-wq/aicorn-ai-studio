import { useState } from 'react';
import { APP_CONFIG } from '@/config/app';
import { useApp } from '@/context/AppContext';

export default function Profile(): JSX.Element {
  const { profile } = useApp();
  const [digest, setDigest] = useState(true);
  return <section className="space-y-4 p-6 pb-24"><h1 className="text-2xl font-semibold">Profile</h1><p>{profile.name || 'Your profile'} · {APP_CONFIG.name}</p><p className="text-sm text-muted-foreground">{profile.goal || APP_CONFIG.tagline}</p><button className="rounded-xl border px-4 py-2" onClick={() => setDigest(value => !value)}>Daily digest: {digest ? 'On' : 'Off'}</button></section>;
}
