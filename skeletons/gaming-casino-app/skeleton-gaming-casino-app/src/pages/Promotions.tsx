import { Progress } from '@/components/ui/Progress';
import { useApp } from '@/context/AppContext';
export default function Promotions(){ const app = useApp(); return <main className="page"><h1 className="title">Promotions</h1><div className="grid two">{app.bonuses.map((bonus)=><section className="card pad stack" key={bonus.id}><h3>{bonus.title}</h3><Progress value={bonus.progress}/><button className="btn" onClick={()=>app.claimBonus(bonus.id)}>{bonus.claimed?'Claimed':'Claim bonus'}</button></section>)}</div></main> }
