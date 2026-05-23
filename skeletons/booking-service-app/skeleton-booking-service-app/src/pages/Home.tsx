import { ServiceCard } from '@/components/ServiceCard';
import { Input } from '@/components/ui/Input';
import { useApp } from '@/context/AppContext';
export default function Home(){ const app = useApp(); return <main className="page"><section className="card hero stack"><span className="badge">Service booking</span><h1 className="title">Explore services and reserve a slot.</h1><Input placeholder="Search services" value={app.query} onChange={(e)=>app.setQuery(e.target.value)}/></section><div className="grid two">{app.filteredServices.map((service)=><ServiceCard key={service.id} service={service} onOpen={(id)=>{app.setSelectedServiceId(id); app.setActiveRoute('ServiceDetail')}}/>)}</div></main> }
