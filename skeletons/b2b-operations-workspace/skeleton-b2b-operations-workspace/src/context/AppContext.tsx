import { createContext, useContext, useMemo, useState } from 'react';
import { activities as seedActivities, records as seedRecords, team as seedTeam } from '@/data/seed';
import type { Activity, RecordItem, Stage, TeamMember } from '@/data/types';
type AppContextValue = { activeRoute: string; setActiveRoute: (route: string) => void; records: RecordItem[]; team: TeamMember[]; activities: Activity[]; query: string; setQuery: (query: string) => void; stageFilter: Stage | 'All'; setStageFilter: (stage: Stage | 'All') => void; selectedRecordId: string; setSelectedRecordId: (id: string) => void; moveRecordStage: (id: string, stage: Stage) => void; createRecord: () => void; filteredRecords: RecordItem[]; pipelineValue: number; };
const AppContext = createContext<AppContextValue | null>(null);
export function AppProvider({ children }: { children: React.ReactNode }) {
 const [activeRoute, setActiveRoute] = useState('Dashboard');
 const [records, setRecords] = useState(seedRecords);
 const [query, setQuery] = useState('');
 const [stageFilter, setStageFilter] = useState<Stage | 'All'>('All');
 const [selectedRecordId, setSelectedRecordId] = useState(seedRecords[0]?.id ?? '');
 const filteredRecords = useMemo(() => records.filter((record) => (stageFilter === 'All' || record.stage === stageFilter) && record.company.toLowerCase().includes(query.toLowerCase())), [records, query, stageFilter]);
 const pipelineValue = useMemo(() => records.reduce((sum, record) => sum + record.value, 0), [records]);
 const moveRecordStage = (id: string, stage: Stage) => setRecords((current) => current.map((record) => record.id === id ? { ...record, stage, lastActivity: `Moved to ${stage}` } : record));
 const createRecord = () => setRecords((current) => [{ id: `rec-${Date.now()}`, company: 'New Account', owner: 'Maya', stage: 'Lead', value: 18000, priority: 'Medium', health: 52, lastActivity: 'Created locally' }, ...current]);
 const value = { activeRoute, setActiveRoute, records, team: seedTeam, activities: seedActivities, query, setQuery, stageFilter, setStageFilter, selectedRecordId, setSelectedRecordId, moveRecordStage, createRecord, filteredRecords, pipelineValue };
 return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
export function useApp() { const ctx = useContext(AppContext); if (!ctx) throw new Error('useApp must be used inside AppProvider'); return ctx; }
