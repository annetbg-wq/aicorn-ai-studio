import { useLocation } from 'react-router-dom';

const PAGE_TITLES: Record<string, string> = {
  '/home': 'Главная',
  '/explore': 'Explore',
  '/notifications': 'Уведомления',
  '/profile': 'Профиль',
};

export default function TopBar() {
  const location = useLocation();
  const title = PAGE_TITLES[location.pathname] ?? 'App';

  return (
    <div style={{ padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.07)', background: '#07070b' }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#a78bfa,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>⚡</div>
      <span style={{ fontSize: 17, fontWeight: 700, color: '#e5e5ea' }}>{title}</span>
      <button style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '6px 10px', color: '#e5e5ea', cursor: 'pointer', fontSize: 16 }}>🔔</button>
    </div>
  );
}
