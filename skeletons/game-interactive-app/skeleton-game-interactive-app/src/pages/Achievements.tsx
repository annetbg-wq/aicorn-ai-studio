import { Progress } from '@/components/ui/Progress';
import { useApp } from '@/context/AppContext';
export default function Achievements(){ const app = useApp(); return <main className="page"><h1 className="title">Achievements</h1><div className="grid two">{app.achievements.map((a)=><section className="card pad stack" key={a.id}><h3>{a.title}</h3><Progress value={a.progress}/><button className="btn secondary" onClick={()=>app.unlockAchievement(a.id)}>{a.unlocked?'Unlocked':'Unlock mock'}</button></section>)}</div></main> }
