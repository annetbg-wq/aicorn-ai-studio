import { useNavigate, useLocation } from 'react-router-dom';

const TABS = [
  { path: '/feed', icon: '🏠', label: 'Лента' },
  { path: '/search', icon: '🔍', label: 'Поиск' },
  { path: '/saved', icon: '🔖', label: 'Сохранённое' },
  { path: '/profile', icon: '👤', label: 'Профиль' },
];

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div style={{ display: 'flex', background: '#0d0d12', borderTop: '1px solid rgba(255,255,255,0.07)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {TABS.map(tab => {
        const active = location.pathname === tab.path || (tab.path === '/feed' && location.pathname.startsWith('/detail'));
        return (
          <button key={tab.path} onClick={() => navigate(tab.path)} style={{
            flex: 1, padding: '10px 0 8px', background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
          }}>
            <span style={{ fontSize: 20, opacity: active ? 1 : 0.4 }}>{tab.icon}</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: active ? '#a78bfa' : '#6b6b7a' }}>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
