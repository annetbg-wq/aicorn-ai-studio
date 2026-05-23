import { Progress } from '@/components/ui/Progress';
import { useApp } from '@/context/AppContext';
export default function Profile(){ const app = useApp(); return <main className="page"><h1 className="title">My profile</h1><section className="card pad stack"><Progress value={app.profileComplete}/><p className="subtitle">Boost is {app.boostActive ? 'active' : 'off'}.</p><button className="btn" onClick={app.toggleBoost}>{app.boostActive?'Turn off boost':'Activate boost'}</button></section></main> }
