import { LevelCard } from '@/components/LevelCard';
import { useApp } from '@/context/AppContext';
export default function LevelSelect(){ const app = useApp(); return <main className="page"><h1 className="title">Level map</h1><div className="grid two">{app.levels.map((level)=><LevelCard key={level.id} level={level} onStart={app.startLevel}/>)}</div></main> }
