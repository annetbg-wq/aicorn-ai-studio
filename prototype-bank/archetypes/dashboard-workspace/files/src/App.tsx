import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import DashboardPage from './pages/Dashboard';
import AnalyticsPage from './pages/Analytics';
import Sidebar from './components/Sidebar';
import { useState } from 'react';

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  return (
    <BrowserRouter>
      <div style={{ display: 'flex', height: '100vh', background: '#07070b', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen(o => !o)} />
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}
