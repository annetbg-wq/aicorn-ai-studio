import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ScannerPage from './pages/Scanner';
import ResultsPage from './pages/Results';
import HistoryPage from './pages/History';

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ maxWidth: 430, margin: '0 auto', height: '100vh', display: 'flex', flexDirection: 'column', background: '#07070b', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <Routes>
            <Route path="/" element={<Navigate to="/scan" replace />} />
            <Route path="/scan" element={<ScannerPage />} />
            <Route path="/result/:id" element={<ResultsPage />} />
            <Route path="/history" element={<HistoryPage />} />
          </Routes>
        </div>
        <BottomNavScanner />
      </div>
    </BrowserRouter>
  );
}

import { useNavigate, useLocation } from 'react-router-dom';

function BottomNavScanner() {
  const navigate = useNavigate();
  const location = useLocation();
  const tabs = [
    { path: '/scan', icon: '📷', label: 'Сканер' },
    { path: '/history', icon: '📋', label: 'История' },
    { path: '/account', icon: '👤', label: 'Аккаунт' },
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
