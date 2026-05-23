import { useApp } from '@/context/AppContext';
export default function Leaderboard(){ const app = useApp(); return <main className="page"><h1 className="title">Leaderboard</h1>{app.leaderboard.map((entry)=><section className="card pad row" key={entry.id}><strong>#{entry.rank} {entry.name}</strong><span>{entry.score}</span></section>)}</main> }
