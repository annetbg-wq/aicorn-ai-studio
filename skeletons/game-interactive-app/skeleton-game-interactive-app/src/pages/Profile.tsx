import { useApp } from '@/context/AppContext';
export default function Profile(){ const app = useApp(); return <main className="page"><h1 className="title">Player profile</h1><section className="card pad"><p className="subtitle">Coins: {app.coins} · Streak: {app.streak} · Score: {app.score}</p></section></main> }
