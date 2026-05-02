import { useState } from 'react';

export default function SettingsPage() {
  const [model, setModel] = useState('gpt-4');
  const [tone, setTone] = useState('balanced');
  const [streaming, setStreaming] = useState(true);

  return (
    <div style={{ padding: '24px 16px' }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, color: '#e5e5ea', margin: '0 0 24px' }}>Настройки</h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ background: '#0d0d12', borderRadius: 16, border: '1px solid rgba(255,255,255,0.07)', padding: '20px' }}>
          <div style={{ fontSize: 11, color: '#6b6b7a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>Ассистент</div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: '#9999aa', marginBottom: 8 }}>Тон ответов</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {['formal', 'balanced', 'casual'].map(t => (
                <button key={t} onClick={() => setTone(t)} style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: tone === t ? 'rgba(167,139,250,0.2)' : 'rgba(255,255,255,0.05)', color: tone === t ? '#a78bfa' : '#6b6b7a' }}>
                  {t === 'formal' ? 'Формальный' : t === 'balanced' ? 'Нейтральный' : 'Дружелюбный'}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: '#9999aa' }}>Потоковые ответы</span>
            <button onClick={() => setStreaming(s => !s)} style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: streaming ? '#a78bfa' : 'rgba(255,255,255,0.1)', position: 'relative', transition: '0.2s' }}>
              <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: streaming ? 23 : 3, transition: '0.2s' }} />
            </button>
          </div>
        </div>

        <div style={{ background: '#0d0d12', borderRadius: 16, border: '1px solid rgba(255,255,255,0.07)', padding: '20px' }}>
          <div style={{ fontSize: 11, color: '#6b6b7a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>История</div>
          <button onClick={() => { if(confirm('Очистить историю?')) {} }} style={{ padding: '10px 16px', borderRadius: 10, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', color: '#f87171', fontSize: 13, cursor: 'pointer' }}>
            🗑️ Очистить историю чата
          </button>
        </div>
      </div>
    </div>
  );
}
