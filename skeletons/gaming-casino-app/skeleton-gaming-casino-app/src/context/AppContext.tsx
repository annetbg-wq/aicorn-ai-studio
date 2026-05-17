import { createContext, useContext, useMemo, useState } from 'react';
import { bonuses as seedBonuses, games as seedGames, tournaments as seedTournaments } from '@/data/seed';
import type { Bonus, Game, Tournament } from '@/data/types';
type AppContextValue = { activeRoute: string; setActiveRoute: (route: string) => void; balance: number; games: Game[]; featuredGames: Game[]; bonuses: Bonus[]; tournaments: Tournament[]; selectedGameId: string; setSelectedGameId: (id: string) => void; playDemo: (id: string) => void; claimBonus: (id: string) => void; sessionLimit: number; setSessionLimit: (limit: number) => void; vipTier: string; };
const AppContext = createContext<AppContextValue | null>(null);
export function AppProvider({ children }: { children: React.ReactNode }) {
 const [activeRoute, setActiveRoute] = useState('Lobby'); const [balance, setBalance] = useState(12500); const [bonuses, setBonuses] = useState(seedBonuses); const [selectedGameId, setSelectedGameId] = useState(seedGames[0]?.id ?? ''); const [sessionLimit, setSessionLimit] = useState(45);
 const featuredGames = useMemo(() => seedGames.filter((game) => game.featured), []);
 const playDemo = (id: string) => { setSelectedGameId(id); setBalance((current) => current + 150); setActiveRoute('GameDetail'); };
 const claimBonus = (id: string) => setBonuses((current) => current.map((bonus) => bonus.id === id ? { ...bonus, claimed:true, progress:100 } : bonus));
 const value = { activeRoute, setActiveRoute, balance, games: seedGames, featuredGames, bonuses, tournaments: seedTournaments, selectedGameId, setSelectedGameId, playDemo, claimBonus, sessionLimit, setSessionLimit, vipTier: balance > 14000 ? 'Gold' : 'Silver' };
 return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
export function useApp() { const ctx = useContext(AppContext); if (!ctx) throw new Error('useApp must be used inside AppProvider'); return ctx; }
