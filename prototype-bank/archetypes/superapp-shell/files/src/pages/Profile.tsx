import { useState } from 'react';

const STATS = [
  { label: 'Публикации', value: '47' },
  { label: 'Подписчики', value: '1.2k' },
  { label: 'Подписки', value: '230' },
];

export default function ProfilePage() {
  const [notifications, setNotifications] = useState(true);

  return (
    <div style={{ padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24, textAlign: 'center' }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg,#a78bfa,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, marginBottom: 12 }}>👤</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#e5e5ea', marginBottom: 4 }}>Пользователь</div>
        <div style={{ fontSize: 13, color: '#6b6b7a', marginBottom: 16 }}>user@example.com</div>
        <div style={{ display: 'flex', gap: 24 }}>
          {STATS.map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#e5e5ea' }}>{s.value}</div>
              <div style={{ fontSize: 11, color: '#6b6b7a' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Settings */}
      <div style={{ background: '#0d0d12', borderRadius: 16, border: '1px solid rgba(255,255,255,0.07)', padding: '4px 0', marginBottom: 16 }}>
        {[
          { icon: '👤', label: 'Редактировать профиль' },
          { icon: '🔔', label: 'Уведомления', toggle: notifications, onToggle: () => setNotifications(n => !n) },
          { icon: '🔒', label: 'Конфиденциальность' },
          { icon: '❓', label: 'Помощь' },
        ].map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' }}>
            <span style={{ fontSize: 18 }}>{item.icon}</span>
            <span style={{ flex: 1, fontSize: 14, color: '#e5e5ea', fontWeight: 500 }}>{item.label}</span>
            {item.toggle !== undefined ? (
              <button onClick={e => { e.stopPropagation(); item.onToggle!(); }} style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: item.toggle ? '#a78bfa' : 'rgba(255,255,255,0.1)', position: 'relative', transition: '0.2s' }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: item.toggle ? 23 : 3, transition: '0.2s' }} />
              </button>
            ) : (
              <span style={{ color: '#6b6b7a', fontSize: 16 }}>›</span>
            )}
          </div>
        ))}
      </div>

      <button style={{ width: '100%', padding: '13px', borderRadius: 12, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', color: '#f87171', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
        Выйти из аккаунта
      </button>
    </div>
  );
}
