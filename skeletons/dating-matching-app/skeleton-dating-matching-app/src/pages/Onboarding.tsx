import { Progress } from '@/components/ui/Progress';
import { useApp } from '@/context/AppContext';
export default function Onboarding(){ const app = useApp(); return <main className="page"><section className="card hero stack"><span className="badge">Profile setup</span><h1 className="title">Make the first impression feel intentional.</h1><Progress value={app.profileComplete}/><button className="btn" onClick={()=>app.setActiveRoute('Discover')}>Start discovering</button></section></main> }
