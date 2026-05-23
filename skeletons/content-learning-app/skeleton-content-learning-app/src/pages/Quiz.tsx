import { useState } from 'react';
import { useApp } from '@/context/AppContext';
export default function Quiz(){ const app = useApp(); const [answer,setAnswer]=useState<number | null>(null); const q=app.quiz[0]; return <main className="page"><h1 className="title">Quiz</h1><section className="card pad stack"><h3>{q.prompt}</h3>{q.options.map((option,index)=><button className={`pill ${answer===index?'active':''}`} key={option} onClick={()=>setAnswer(index)}>{option}</button>)}<button className="btn" onClick={()=>answer!==null && app.submitQuiz(answer)}>Submit</button></section></main> }
