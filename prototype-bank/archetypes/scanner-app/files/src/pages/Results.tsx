import { useNavigate } from 'react-router-dom';

export default function ResultsPage() {
  const navigate = useNavigate();
  const result = { type: 'QR Code', value: 'https://example.com/product/12345', date: new Date().toLocaleString('ru'), confidence: 98 };

  return (
    <div style={{ padding: '24px 16px', minHeight: 'calc(100vh - 60px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => navigate('/scan')} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 12px', color: '#e5e5ea', cursor: 'pointer' }}>← Назад</button>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#e5e5ea', margin: 0 }}>Результат</h1>
      </div>

      <div style={{ background: '#0d0d12', borderRadius: 20, border: '1px solid rgba(255,255,255,0.07)', padding: '24px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(74,222,128,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>✅</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#4ade80' }}>Успешно распознан</div>
            <div style={{ fontSize: 12, color: '#6b6b7a' }}>{result.date}</div>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: '#6b6b7a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Тип</div>
          <div style={{ fontSize: 15, color: '#e5e5ea', fontWeight: 600 }}>{result.type}</div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: '#6b6b7a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Содержимое</div>
          <div style={{ fontSize: 14, color: '#a78bfa', fontWeight: 600, wordBreak: 'break-all' }}>{result.value}</div>
        </div>

        <div>
          <div style={{ fontSize: 11, color: '#6b6b7a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Уверенность</div>
          <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.07)', marginBottom: 4 }}>
            <div style={{ width: `${result.confidence}%`, height: '100%', borderRadius: 3, background: '#4ade80' }} />
          </div>
          <div style={{ fontSize: 12, color: '#4ade80', fontWeight: 700 }}>{result.confidence}%</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button style={{ flex: 1, padding: '13px', borderRadius: 12, background: '#a78bfa', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>🔗 Открыть</button>
        <button style={{ flex: 1, padding: '13px', borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e5ea', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>📋 Копировать</button>
      </div>
    </div>
  );
}
