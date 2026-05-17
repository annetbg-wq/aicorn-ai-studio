import { ListingCard } from '@/components/ListingCard';
import { Tabs } from '@/components/ui/Tabs';
import { useApp } from '@/context/AppContext';
const categories = ['All','Creative','Consulting','Travel','Automation'];
export default function Browse(){ const app = useApp(); return <main className="page"><h1 className="title">Browse</h1><Tabs tabs={categories} active={app.category} onChange={app.setCategory}/><div className="grid two">{app.filteredListings.map((listing)=><ListingCard key={listing.id} listing={listing} onOpen={(id)=>{app.setSelectedListingId(id); app.setActiveRoute('Listing')}} onSave={app.saveListing} onCart={app.addToCart}/>)}</div></main> }
