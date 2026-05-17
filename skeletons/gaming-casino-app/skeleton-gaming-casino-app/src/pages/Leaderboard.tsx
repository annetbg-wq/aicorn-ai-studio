import { useApp } from '@/context/AppContext';
export default function Leaderboard(){ const app = useApp(); return <main className="page"><h1 className="title">Tournaments</h1>{app.tournaments.map((t)=><section className="card pad row" key={t.id}><div><strong>{t.title}</strong><p className="subtitle">Rank #{t.rank}</p></div><span className="badge">{t.prize}</span></section>)}</main> }
