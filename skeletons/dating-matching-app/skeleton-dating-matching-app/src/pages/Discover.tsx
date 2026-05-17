import { ProfileCard } from '@/components/ProfileCard';
import { useApp } from '@/context/AppContext';
export default function Discover(){ const app = useApp(); return <main className="page"><h1 className="title">Discover</h1>{app.currentCandidate ? <ProfileCard candidate={app.currentCandidate} onLike={app.swipeRight} onSkip={app.swipeLeft}/> : <section className="card pad"><p className="subtitle">No more local candidates in this mock queue.</p></section>}</main> }
