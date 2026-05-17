import { useApp } from '@/context/AppContext';
export default function Profile(){ const app = useApp(); return <main className="page"><h1 className="title">Profile</h1><section className="card pad"><p className="subtitle">Upcoming bookings: {app.bookings.filter(b=>b.status==='Upcoming').length}</p></section></main> }
