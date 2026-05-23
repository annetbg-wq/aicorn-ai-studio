import { Progress as ProgressBar } from '@/components/ui/Progress';
import { useApp } from '@/context/AppContext';
export default function Progress(){ const app = useApp(); return <main className="page"><h1 className="title">Progress</h1><section className="card pad stack"><strong>{app.learningProgress}% average progress</strong><ProgressBar value={app.learningProgress}/><p className="subtitle">{app.certificates} certificates earned.</p></section></main> }
