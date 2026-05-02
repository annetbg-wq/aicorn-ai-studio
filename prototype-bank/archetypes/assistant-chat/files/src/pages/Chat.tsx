import { useState, useRef, useEffect } from 'react';
import MessageBubble from '../components/MessageBubble';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  time: string;
}

const SUGGESTIONS = [
  'Помоги написать бизнес-план',
  'Объясни концепцию продукта',
  'Составь маркетинговую стратегию',
  'Проанализируй конкурентов',
];

const MOCK_RESPONSES = [
  'Отличный вопрос! Вот что я думаю по этой теме...',
  'Рассмотрим это с нескольких углов. Во-первых...',
  'Хорошо, давайте разберём это шаг за шагом.',
  'Интересная задача! Предлагаю следующий подход...',
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const sendMessage = (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = { id: Date.now().toString(), role: 'user', text: text.trim(), time: new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }) };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    setTimeout(() => {
      const reply: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: MOCK_RESPONSES[Math.floor(Math.random() * MOCK_RESPONSES.length)],
        time: new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages(prev => [...prev, reply]);
      setLoading(false);
    }, 1200 + Math.random() * 800);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)' }}>
      <div style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#a78bfa,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🤖</div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#e5e5ea' }}>AI Ассистент</div>
          <div style={{ fontSize: 11, color: '#4ade80' }}>● Онлайн</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.length === 0 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
            <div style={{ fontSize: 48 }}>🤖</div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#e5e5ea', marginBottom: 6 }}>Чем могу помочь?</div>
              <div style={{ fontSize: 13, color: '#6b6b7a' }}>Задайте любой вопрос или выберите подсказку</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, width: '100%' }}>
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => sendMessage(s)} style={{ padding: '12px', borderRadius: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#9999aa', fontSize: 12, cursor: 'pointer', textAlign: 'left', lineHeight: 1.4 }}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map(msg => <MessageBubble key={msg.id} message={msg} />)}
        {loading && (
          <div style={{ display: 'flex', gap: 8, padding: '10px 14px', background: '#0d0d12', borderRadius: '16px 16px 16px 4px', alignSelf: 'flex-start', border: '1px solid rgba(255,255,255,0.07)', maxWidth: '70%' }}>
            {[0, 1, 2].map(i => <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: '#a78bfa', animation: `bounce 1.2s ${i * 0.2}s ease-in-out infinite` }} />)}
            <style>{`@keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }`}</style>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', gap: 8 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendMessage(input))} placeholder="Введите сообщение..." style={{ flex: 1, padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e5ea', fontSize: 14, outline: 'none' }} />
        <button onClick={() => sendMessage(input)} style={{ padding: '12px 16px', borderRadius: 12, background: '#a78bfa', border: 'none', color: '#fff', fontSize: 16, cursor: 'pointer' }}>↑</button>
      </div>
    </div>
  );
}
