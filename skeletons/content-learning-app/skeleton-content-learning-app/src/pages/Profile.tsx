import { useApp } from '@/context/AppContext';
export default function Profile(){ const app = useApp(); return <main className="page"><h1 className="title">Learner profile</h1><section className="card pad"><p className="subtitle">Streak: {app.streak} days · Courses: {app.courses.length}</p></section></main> }
