import { useNavigate } from 'react-router-dom';

const HISTORY = [
  { id: '1', type: 'QR Code', result: 'https://example.com', date: '26 апр, 10:30', status: 'success', icon: '🔗' },
  { id: '2', type: 'Штрихкод', result: '4607000400879', date: '25 апр, 15:45', status: 'success', icon: '📦' },
  { id: '3', type: 'QR Code', result: 'https://shop.example.com/item/99', date: '24 апр, 09:12', status: 'success', icon: '🔗' },
  { id: '4', type: 'QR Code', result: 'Не распознан', date: '23 апр, 18:00', status: 'error', icon: '❌' },
  { id: '5', type: 'Штрихкод', result: '5901234123457', date: '22 апр, 12:20', status: 'success', icon: '📦' },
];

export default function HistoryPage() {
  const navigate = useNavigate();

  return (
    <div style={{ padding: '24px 16px' }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, color: '#e5e5ea', margin: '0 0 20px' }}>История</h1>

      {HISTORY.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#6b6b7a' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
          <p>История сканирований пуста</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {HISTORY.map(item => (
            <div key={item.id} onClick={() => navigate(`/result/${item.id}`)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px', background: '#0d0d12', borderRadius: 14, border: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer' }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: item.status === 'success' ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{item.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#e5e5ea', marginBottom: 2 }}>{item.type}</div>
                <div style={{ fontSize: 12, color: '#6b6b7a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.result}</div>
              </div>
              <div style={{ fontSize: 11, color: '#6b6b7a', whiteSpace: 'nowrap' }}>{item.date}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
