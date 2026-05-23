import { createContext, useContext, useMemo, useState } from 'react';
import { drafts as seedDrafts, mediaAssets as seedMediaAssets, publications as seedPublications } from '@/data/seed';
import type { Draft, MediaAsset, Publication } from '@/data/types';
type AppContextValue = { activeRoute: string; setActiveRoute: (route: string) => void; drafts: Draft[]; mediaAssets: MediaAsset[]; publications: Publication[]; activeDocId: string; setActiveDocId: (id: string) => void; activeDraft?: Draft; updateDraft: (text: string) => void; createDraft: () => void; publishDoc: () => void; insertMedia: (id: string) => void; wordCount: number; };
const AppContext = createContext<AppContextValue | null>(null);
export function AppProvider({ children }: { children: React.ReactNode }) {
 const [activeRoute, setActiveRoute] = useState('Home'); const [drafts, setDrafts] = useState(seedDrafts); const [mediaAssets, setMediaAssets] = useState(seedMediaAssets); const [publications, setPublications] = useState(seedPublications); const [activeDocId, setActiveDocId] = useState(seedDrafts[0]?.id ?? '');
 const activeDraft = drafts.find((draft) => draft.id === activeDocId); const wordCount = activeDraft?.words ?? 0;
 const updateDraft = (text: string) => setDrafts((current) => current.map((draft) => draft.id === activeDocId ? { ...draft, body:text, words:text.split(/\s+/).filter(Boolean).length, updated:'Now' } : draft));
 const createDraft = () => { const draft = { id:`dr-${Date.now()}`, title:'Untitled creative brief', status:'Draft' as const, words:0, updated:'Now', body:'' }; setDrafts((current) => [draft, ...current]); setActiveDocId(draft.id); setActiveRoute('Editor'); };
 const publishDoc = () => { if (!activeDraft) return; setDrafts((current) => current.map((draft) => draft.id === activeDocId ? { ...draft, status:'Published' } : draft)); setPublications((current) => [{ id:`pub-${Date.now()}`, title:activeDraft.title, views:0, engagement:0 }, ...current]); };
 const insertMedia = (id: string) => setMediaAssets((current) => current.map((asset) => asset.id === id ? { ...asset, used:true } : asset));
 const value = { activeRoute, setActiveRoute, drafts, mediaAssets, publications, activeDocId, setActiveDocId, activeDraft, updateDraft, createDraft, publishDoc, insertMedia, wordCount };
 return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
export function useApp() { const ctx = useContext(AppContext); if (!ctx) throw new Error('useApp must be used inside AppProvider'); return ctx; }
