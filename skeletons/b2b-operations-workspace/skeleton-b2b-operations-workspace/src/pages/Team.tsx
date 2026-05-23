import { Progress } from '@/components/ui/Progress';
import { useApp } from '@/context/AppContext';
export default function Team(){ const app = useApp(); return <main className="page"><h1 className="title">Team load</h1><div className="grid three">{app.team.map((member)=><section className="card pad stack" key={member.id}><span className="logo-mark">{member.avatar}</span><h3>{member.name}</h3><p className="subtitle">{member.role}</p><Progress value={member.load}/></section>)}</div></main> }
