import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ChatPage from './pages/Chat';
import SettingsPage from './pages/Settings';
import { useNavigate, useLocation } from 'react-router-dom';

function BottomNavChat() {
  const navigate = useNavigate();
  const location = useLocation();
  const tabs = [
    { path: '/chat', icon: '💬', label: 'Чат' },
    { path: '/settings', icon: '⚙️', label: 'Настройки' },
  ];
  return (
    <div style={{ display: 'flex', background: '#0d0d12', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
      {tabs.map(tab => {
        const active = location.pathname === tab.path;
        return (
          <button key={tab.path} onClick={() => navigate(tab.path)} style={{ flex: 1, padding: '10px 0 8px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <span style={{ fontSize: 20, opacity: active ? 1 : 0.4 }}>{tab.icon}</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: active ? '#a78bfa' : '#6b6b7a' }}>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ maxWidth: 430, margin: '0 auto', height: '100vh', display: 'flex', flexDirection: 'column', background: '#07070b', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <Routes>
            <Route path="/" element={<Navigate to="/chat" replace />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </div>
        <BottomNavChat />
      </div>
    </BrowserRouter>
  );
}
