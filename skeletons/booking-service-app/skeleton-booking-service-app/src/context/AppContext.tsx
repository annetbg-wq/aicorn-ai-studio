import { createContext, useContext, useMemo, useState } from 'react';
import { bookings as seedBookings, services as seedServices } from '@/data/seed';
import type { Booking, Service } from '@/data/types';
type AppContextValue = { activeRoute: string; setActiveRoute: (route: string) => void; services: Service[]; filteredServices: Service[]; bookings: Booking[]; query: string; setQuery: (query: string) => void; category: string; setCategory: (category: string) => void; selectedServiceId: string; setSelectedServiceId: (id: string) => void; selectedSlot: string; setSelectedSlot: (slot: string) => void; book: () => void; cancelBooking: (id: string) => void; rateBooking: (id: string, rating: number) => void; };
const AppContext = createContext<AppContextValue | null>(null);
export function AppProvider({ children }: { children: React.ReactNode }) {
 const [activeRoute, setActiveRoute] = useState('Home'); const [bookings, setBookings] = useState(seedBookings); const [query, setQuery] = useState(''); const [category, setCategory] = useState('All'); const [selectedServiceId, setSelectedServiceId] = useState(seedServices[0]?.id ?? ''); const [selectedSlot, setSelectedSlot] = useState(seedServices[0]?.availableSlots[0] ?? '');
 const filteredServices = useMemo(() => seedServices.filter((service) => (category === 'All' || service.category === category) && service.title.toLowerCase().includes(query.toLowerCase())), [category, query]);
 const book = () => setBookings((current) => [{ id:`bk-${Date.now()}`, serviceId:selectedServiceId, time:selectedSlot, status:'Upcoming' }, ...current]);
 const cancelBooking = (id: string) => setBookings((current) => current.map((booking) => booking.id === id ? { ...booking, status:'Cancelled' } : booking));
 const rateBooking = (id: string, rating: number) => setBookings((current) => current.map((booking) => booking.id === id ? { ...booking, rating, status:'Completed' } : booking));
 const value = { activeRoute, setActiveRoute, services: seedServices, filteredServices, bookings, query, setQuery, category, setCategory, selectedServiceId, setSelectedServiceId, selectedSlot, setSelectedSlot, book, cancelBooking, rateBooking };
 return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
export function useApp() { const ctx = useContext(AppContext); if (!ctx) throw new Error('useApp must be used inside AppProvider'); return ctx; }
