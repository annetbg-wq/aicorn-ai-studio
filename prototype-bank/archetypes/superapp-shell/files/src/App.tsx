import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import HomePage from './pages/Home';
import ExplorePage from './pages/Explore';
import ProfilePage from './pages/Profile';
import BottomNav from './components/BottomNav';
import TopBar from './components/TopBar';

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ maxWidth: 430, margin: '0 auto', height: '100vh', display: 'flex', flexDirection: 'column', background: '#07070b', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <TopBar />
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <Routes>
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route path="/home" element={<HomePage />} />
            <Route path="/explore" element={<ExplorePage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Routes>
        </div>
        <BottomNav />
      </div>
    </BrowserRouter>
  );
}
