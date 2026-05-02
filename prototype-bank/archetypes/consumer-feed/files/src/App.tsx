import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import FeedPage from './pages/Feed';
import DetailPage from './pages/Detail';
import BottomNav from './components/BottomNav';

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ maxWidth: 430, margin: '0 auto', height: '100vh', display: 'flex', flexDirection: 'column', background: '#07070b' }}>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <Routes>
            <Route path="/" element={<Navigate to="/feed" replace />} />
            <Route path="/feed" element={<FeedPage />} />
            <Route path="/detail/:id" element={<DetailPage />} />
          </Routes>
        </div>
        <BottomNav />
      </div>
    </BrowserRouter>
  );
}
