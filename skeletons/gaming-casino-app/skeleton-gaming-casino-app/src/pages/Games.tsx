import { GameCard } from '@/components/GameCard';
import { Tabs } from '@/components/ui/Tabs';
import { useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
const categories = ['All','Slots','Table','Live','Crash'];
export default function Games(){ const app = useApp(); const [cat,setCat]=useState('All'); const games=useMemo(()=>app.games.filter(g=>cat==='All'||g.category===cat),[app.games,cat]); return <main className="page"><h1 className="title">Games</h1><Tabs tabs={categories} active={cat} onChange={setCat}/><div className="grid two">{games.map((game)=><GameCard key={game.id} game={game} onPlay={app.playDemo}/>)}</div></main> }
