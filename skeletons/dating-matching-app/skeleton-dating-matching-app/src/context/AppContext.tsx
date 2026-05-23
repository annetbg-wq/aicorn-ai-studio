import { createContext, useContext, useMemo, useState } from 'react';
import { candidates as seedCandidates, matches as seedMatches, messages as seedMessages } from '@/data/seed';
import type { Candidate, ChatMessage, Match } from '@/data/types';
type AppContextValue = { activeRoute: string; setActiveRoute: (route: string) => void; candidates: Candidate[]; currentCandidate?: Candidate; matches: Match[]; messages: ChatMessage[]; profileComplete: number; swipeRight: (id: string) => void; swipeLeft: (id: string) => void; sendMessage: (text: string) => void; boostActive: boolean; toggleBoost: () => void; };
const AppContext = createContext<AppContextValue | null>(null);
export function AppProvider({ children }: { children: React.ReactNode }) {
 const [activeRoute, setActiveRoute] = useState('Discover'); const [candidates, setCandidates] = useState(seedCandidates); const [matches, setMatches] = useState(seedMatches); const [messages, setMessages] = useState(seedMessages); const [boostActive, setBoostActive] = useState(false);
 const currentCandidate = candidates[0]; const profileComplete = useMemo(() => boostActive ? 92 : 76, [boostActive]);
 const swipeRight = (id: string) => { const candidate = candidates.find((person) => person.id === id); setCandidates((current) => current.filter((person) => person.id !== id)); if (candidate) setMatches((current) => [{ id:`m-${Date.now()}`, name:candidate.name, lastMessage:'You matched locally. Say hello.', unread:0 }, ...current]); };
 const swipeLeft = (id: string) => setCandidates((current) => current.filter((person) => person.id !== id));
 const sendMessage = (text: string) => setMessages((current) => [...current, { id:`c-${Date.now()}`, from:'You', text, mine:true }]);
 const value = { activeRoute, setActiveRoute, candidates, currentCandidate, matches, messages, profileComplete, swipeRight, swipeLeft, sendMessage, boostActive, toggleBoost: () => setBoostActive((active) => !active) };
 return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
export function useApp() { const ctx = useContext(AppContext); if (!ctx) throw new Error('useApp must be used inside AppProvider'); return ctx; }
