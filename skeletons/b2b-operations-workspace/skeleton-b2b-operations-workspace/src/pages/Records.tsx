import { Input } from '@/components/ui/Input';
import { Tabs } from '@/components/ui/Tabs';
import { RecordTable } from '@/components/RecordTable';
import { useApp } from '@/context/AppContext';
import type { Stage } from '@/data/types';
const stages = ['All','Lead','Qualified','In Review','Approved','Blocked'];
export default function Records(){ const app = useApp(); return <main className="page"><h1 className="title">Records</h1><Input placeholder="Search accounts" value={app.query} onChange={(e)=>app.setQuery(e.target.value)}/><Tabs tabs={stages} active={app.stageFilter} onChange={(tab)=>app.setStageFilter(tab as Stage | 'All')}/><section className="card pad"><RecordTable records={app.filteredRecords} onOpen={(id)=>{app.setSelectedRecordId(id); app.setActiveRoute('RecordDetail')}} onMove={app.moveRecordStage}/></section></main> }
