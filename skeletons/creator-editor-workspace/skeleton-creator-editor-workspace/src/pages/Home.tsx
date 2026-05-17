import { DraftCard } from '@/components/DraftCard';
import { Button } from '@/components/ui/Button';
import { useApp } from '@/context/AppContext';
export default function Home(){ const app = useApp(); return <main className="page"><header className="page-header"><div><div className="eyebrow">Creator cockpit</div><h1 className="title">Draft, edit, publish and measure.</h1><p className="subtitle">A modular editor workspace skeleton with drafts, media, publications and analytics.</p></div><Button onClick={app.createDraft}>New draft</Button></header><div className="grid three">{app.drafts.map((draft)=><DraftCard key={draft.id} draft={draft} onOpen={(id)=>{app.setActiveDocId(id); app.setActiveRoute('Editor')}}/>)}</div></main> }
