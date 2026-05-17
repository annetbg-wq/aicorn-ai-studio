import { createContext, useContext, useMemo, useState } from 'react';
import { listings as seedListings, messages as seedMessages, orders as seedOrders } from '@/data/seed';
import type { Listing, Message, Order } from '@/data/types';
type AppContextValue = { activeRoute: string; setActiveRoute: (route: string) => void; listings: Listing[]; filteredListings: Listing[]; orders: Order[]; messages: Message[]; cart: string[]; query: string; setQuery: (query: string) => void; category: string; setCategory: (category: string) => void; selectedListingId: string; setSelectedListingId: (id: string) => void; saveListing: (id: string) => void; addToCart: (id: string) => void; publishListing: () => void; sendMessage: (text: string) => void; };
const AppContext = createContext<AppContextValue | null>(null);
export function AppProvider({ children }: { children: React.ReactNode }) {
 const [activeRoute, setActiveRoute] = useState('Home'); const [listings, setListings] = useState(seedListings); const [orders] = useState(seedOrders); const [messages, setMessages] = useState(seedMessages); const [cart, setCart] = useState<string[]>([]); const [query, setQuery] = useState(''); const [category, setCategory] = useState('All'); const [selectedListingId, setSelectedListingId] = useState(seedListings[0]?.id ?? '');
 const filteredListings = useMemo(() => listings.filter((listing) => (category === 'All' || listing.category === category) && listing.title.toLowerCase().includes(query.toLowerCase())), [listings, category, query]);
 const saveListing = (id: string) => setListings((current) => current.map((listing) => listing.id === id ? { ...listing, saved: !listing.saved } : listing));
 const addToCart = (id: string) => setCart((current) => current.includes(id) ? current : [...current, id]);
 const publishListing = () => setListings((current) => [{ id:`lst-${Date.now()}`, title:'New seller listing', seller:'You', category:'Creative', price:95, rating:0, saved:false, imageTone:'gold' }, ...current]);
 const sendMessage = (text: string) => setMessages((current) => [...current, { id:`msg-${Date.now()}`, from:'You', text, mine:true }]);
 const value = { activeRoute, setActiveRoute, listings, filteredListings, orders, messages, cart, query, setQuery, category, setCategory, selectedListingId, setSelectedListingId, saveListing, addToCart, publishListing, sendMessage };
 return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
export function useApp() { const ctx = useContext(AppContext); if (!ctx) throw new Error('useApp must be used inside AppProvider'); return ctx; }
