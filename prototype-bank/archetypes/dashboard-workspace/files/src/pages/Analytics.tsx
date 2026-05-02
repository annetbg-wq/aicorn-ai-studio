const DATA_POINTS = [
  { month: 'Янв', revenue: 85000, users: 2100 },
  { month: 'Фев', revenue: 92000, users: 2400 },
  { month: 'Мар', revenue: 105000, users: 2850 },
  { month: 'Апр', revenue: 118000, users: 3200 },
  { month: 'Май', revenue: 127000, users: 3540 },
  { month: 'Июн', revenue: 142500, users: 3840 },
];

const maxRevenue = Math.max(...DATA_POINTS.map(d => d.revenue));

export default function AnalyticsPage() {
  return (
    <div style={{ padding: '24px', maxWidth: 900 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: '#e5e5ea', margin: '0 0 4px' }}>Аналитика</h1>
      <p style={{ fontSize: 14, color: '#6b6b7a', margin: '0 0 28px' }}>Тренды за последние 6 месяцев</p>

      <div style={{ background: '#0d0d12', borderRadius: 16, border: '1px solid rgba(255,255,255,0.07)', padding: '20px', marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#e5e5ea', margin: '0 0 20px' }}>Выручка по месяцам</h2>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 160 }}>
          {DATA_POINTS.map(d => (
            <div key={d.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{ fontSize: 11, color: '#6b6b7a' }}>₽{(d.revenue / 1000).toFixed(0)}k</div>
              <div style={{ width: '100%', borderRadius: '4px 4px 0 0', background: 'linear-gradient(to top, #8b5cf6, #a78bfa)', height: `${(d.revenue / maxRevenue) * 120}px`, transition: '0.3s' }} />
              <div style={{ fontSize: 11, color: '#9999aa' }}>{d.month}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ background: '#0d0d12', borderRadius: 16, border: '1px solid rgba(255,255,255,0.07)', padding: '20px' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#e5e5ea', margin: '0 0 16px' }}>Источники трафика</h3>
          {[
            { label: 'Органический поиск', pct: 42, color: '#a78bfa' },
            { label: 'Прямой переход', pct: 28, color: '#4ade80' },
            { label: 'Реклама', pct: 20, color: '#fbbf24' },
            { label: 'Реферальный', pct: 10, color: '#60a5fa' },
          ].map(s => (
            <div key={s.label} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: '#9999aa' }}>{s.label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: s.color }}>{s.pct}%</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.07)' }}>
                <div style={{ width: `${s.pct}%`, height: '100%', borderRadius: 3, background: s.color }} />
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: '#0d0d12', borderRadius: 16, border: '1px solid rgba(255,255,255,0.07)', padding: '20px' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#e5e5ea', margin: '0 0 16px' }}>Ключевые метрики</h3>
          {[
            { label: 'Avg. Session', value: '4м 23с' },
            { label: 'Bounce Rate', value: '38.2%' },
            { label: 'Pages/Session', value: '3.7' },
            { label: 'ARPU', value: '₽1 240' },
          ].map(m => (
            <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontSize: 13, color: '#9999aa' }}>{m.label}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#e5e5ea' }}>{m.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
