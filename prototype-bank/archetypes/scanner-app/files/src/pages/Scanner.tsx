import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function ScannerPage() {
  const [scanning, setScanning] = useState(false);
  const navigate = useNavigate();

  const handleScan = () => {
    setScanning(true);
    setTimeout(() => {
      setScanning(false);
      navigate('/result/new');
    }, 2000);
  };

  return (
    <div style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: 'calc(100vh - 60px)' }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, color: '#e5e5ea', margin: '0 0 8px', textAlign: 'center' }}>Сканер</h1>
      <p style={{ fontSize: 14, color: '#6b6b7a', margin: '0 0 32px', textAlign: 'center' }}>Наведите камеру на QR-код или штрихкод</p>

      {/* Scanner viewport */}
      <div style={{ width: 280, height: 280, borderRadius: 24, border: '2px solid rgba(167,139,250,0.4)', position: 'relative', overflow: 'hidden', background: '#0d0d12', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 32 }}>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr' }}>
          {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map(pos => (
            <div key={pos} style={{ display: 'flex', alignItems: pos.includes('bottom') ? 'flex-end' : 'flex-start', justifyContent: pos.includes('right') ? 'flex-end' : 'flex-start', padding: 12 }}>
              <div style={{ width: 24, height: 24, borderStyle: 'solid', borderColor: '#a78bfa', borderWidth: `${pos.includes('top') ? 3 : 0}px ${pos.includes('right') ? 3 : 0}px ${pos.includes('bottom') ? 3 : 0}px ${pos.includes('left') ? 3 : 0}px`, borderRadius: pos === 'top-left' ? '4px 0 0 0' : pos === 'top-right' ? '0 4px 0 0' : pos === 'bottom-left' ? '0 0 0 4px' : '0 0 4px 0' }} />
            </div>
          ))}
        </div>
        {scanning ? (
          <div style={{ width: '80%', height: 2, background: 'linear-gradient(90deg, transparent, #a78bfa, transparent)', animation: 'scan 1.5s ease-in-out infinite' }}>
            <style>{`@keyframes scan { 0%,100% { transform: translateY(-80px); } 50% { transform: translateY(80px); } }`}</style>
          </div>
        ) : (
          <span style={{ fontSize: 40, opacity: 0.3 }}>📷</span>
        )}
      </div>

      <button onClick={handleScan} disabled={scanning} style={{
        padding: '16px 48px', borderRadius: 16, border: 'none', cursor: scanning ? 'not-allowed' : 'pointer',
        background: scanning ? 'rgba(167,139,250,0.3)' : 'linear-gradient(135deg, #a78bfa, #8b5cf6)',
        color: '#fff', fontSize: 16, fontWeight: 700,
      }}>
        {scanning ? 'Сканирование...' : 'Начать сканирование'}
      </button>

      <p style={{ fontSize: 12, color: '#6b6b7a', marginTop: 16, textAlign: 'center' }}>Поддерживаются QR-коды, EAN-13, Code128</p>
    </div>
  );
}
