import { Progress } from '@/components/ui/Progress';
import { useApp } from '@/context/AppContext';
export default function Home(){ const app = useApp(); return <main className="page"><section className="card hero stack"><span className="badge">{app.streak}-day streak · {app.coins} coins</span><h1 className="title">Daily challenge and game progress.</h1><Progress value={app.progress}/><button className="btn" onClick={()=>app.setActiveRoute('LevelSelect')}>Choose level</button></section></main> }
