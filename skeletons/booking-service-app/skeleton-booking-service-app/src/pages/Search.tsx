import { Tabs } from '@/components/ui/Tabs';
import { ServiceCard } from '@/components/ServiceCard';
import { useApp } from '@/context/AppContext';
const categories = ['All','Wellness','Creative','Fitness'];
export default function Search(){ const app = useApp(); return <main className="page"><h1 className="title">Search</h1><Tabs tabs={categories} active={app.category} onChange={app.setCategory}/><div className="grid two">{app.filteredServices.map((service)=><ServiceCard key={service.id} service={service} onOpen={(id)=>{app.setSelectedServiceId(id); app.setActiveRoute('ServiceDetail')}}/>)}</div></main> }
