interface KPICardProps {
  label: string;
  value: string;
  change: number;
  trend: 'up' | 'down';
  icon: string;
}

export default function KPICard({ label, value, change, trend, icon }: KPICardProps) {
  const isPositive = trend === 'up';
  return (
    <div style={{ background: '#0d0d12', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: '#6b6b7a', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
        <span style={{ fontSize: 20 }}>{icon}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: '#e5e5ea', marginBottom: 6 }}>{value}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: isPositive ? '#4ade80' : '#f87171' }}>
          {isPositive ? '▲' : '▼'} {Math.abs(change)}%
        </span>
        <span style={{ fontSize: 11, color: '#6b6b7a' }}>vs прошлый месяц</span>
      </div>
    </div>
  );
}
