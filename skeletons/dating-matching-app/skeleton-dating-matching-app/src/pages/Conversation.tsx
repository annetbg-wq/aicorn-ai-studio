import { useState } from 'react';
import { Input } from '@/components/ui/Input';
import { useApp } from '@/context/AppContext';
export default function Conversation(){ const app = useApp(); const [text,setText]=useState(''); return <main className="page"><h1 className="title">Conversation</h1><section className="card pad stack">{app.messages.map((m)=><p key={m.id} className="subtitle"><strong>{m.from}:</strong> {m.text}</p>)}<Input value={text} onChange={(e)=>setText(e.target.value)} placeholder="Write a message"/><button className="btn" onClick={()=>{ if(text.trim()){app.sendMessage(text); setText('')}}}>Send</button></section></main> }
