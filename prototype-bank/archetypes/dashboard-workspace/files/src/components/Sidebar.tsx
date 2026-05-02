import { useNavigate, useLocation } from 'react-router-dom';

const NAV_ITEMS = [
  { path: '/dashboard', icon: '📊', label: 'Дашборд' },
  { path: '/analytics', icon: '📈', label: 'Аналитика' },
  { path: '/settings', icon: '⚙️', label: 'Настройки' },
];

interface SidebarProps {
  open: boolean;
  onToggle: () => void;
}

export default function Sidebar({ open, onToggle }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div style={{
      width: open ? 220 : 64, transition: 'width 0.25s ease', background: '#0d0d12',
      borderRight: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column',
      overflow: 'hidden', flexShrink: 0,
    }}>
      <div style={{ padding: '20px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#a78bfa,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>⚡</div>
        {open && <span style={{ fontSize: 16, fontWeight: 800, color: '#e5e5ea', whiteSpace: 'nowrap' }}>WorkSpace</span>}
      </div>

      <nav style={{ flex: 1, padding: '12px 8px' }}>
        {NAV_ITEMS.map(item => {
          const active = location.pathname === item.path;
          return (
            <button key={item.path} onClick={() => navigate(item.path)} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 10px',
              borderRadius: 10, border: 'none', cursor: 'pointer', marginBottom: 2, textAlign: 'left',
              background: active ? 'rgba(167,139,250,0.12)' : 'transparent',
              color: active ? '#a78bfa' : '#6b6b7a',
            }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{item.icon}</span>
              {open && <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <button onClick={onToggle} style={{ padding: '14px', background: 'none', border: 'none', cursor: 'pointer', color: '#6b6b7a', fontSize: 16, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        {open ? '◀' : '▶'}
      </button>
    </div>
  );
}
