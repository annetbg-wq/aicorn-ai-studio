const FEATURED = [
  { id: '1', title: 'Новинки недели', subtitle: 'Топ контент за 7 дней', image: 'https://source.unsplash.com/400x200/?featured,trending', badge: '🔥 Тренд' },
  { id: '2', title: 'Рекомендуем для вас', subtitle: 'На основе ваших интересов', image: 'https://source.unsplash.com/400x200/?personal,recommendation', badge: '⭐ Для вас' },
];

const QUICK_ACTIONS = [
  { icon: '🔍', label: 'Поиск' },
  { icon: '📚', label: 'Библиотека' },
  { icon: '💬', label: 'Сообщения' },
  { icon: '🔔', label: 'Уведомления' },
];

const RECENT = [
  { id: '1', title: 'Материал 1', category: 'Категория', time: '2ч назад', img: 'https://source.unsplash.com/80x80/?item1' },
  { id: '2', title: 'Материал 2', category: 'Другое', time: '5ч назад', img: 'https://source.unsplash.com/80x80/?item2' },
  { id: '3', title: 'Материал 3', category: 'Главное', time: '1д назад', img: 'https://source.unsplash.com/80x80/?item3' },
];

export default function HomePage() {
  return (
    <div style={{ padding: '16px 0 16px' }}>
      {/* Featured carousel */}
      <div style={{ display: 'flex', gap: 12, padding: '0 16px', overflowX: 'auto', scrollbarWidth: 'none', marginBottom: 24 }}>
        {FEATURED.map(item => (
          <div key={item.id} style={{ minWidth: 300, borderRadius: 20, overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
            <img src={item.image} alt={item.title} style={{ width: '100%', height: 160, objectFit: 'cover' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(7,7,11,0.9) 0%, transparent 60%)' }} />
            <div style={{ position: 'absolute', bottom: 12, left: 14, right: 14 }}>
              <span style={{ padding: '3px 8px', borderRadius: 20, background: 'rgba(167,139,250,0.3)', color: '#a78bfa', fontSize: 11, fontWeight: 700, backdropFilter: 'blur(8px)' }}>{item.badge}</span>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginTop: 6 }}>{item.title}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{item.subtitle}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div style={{ display: 'flex', gap: 0, padding: '0 16px', marginBottom: 24, justifyContent: 'space-around' }}>
        {QUICK_ACTIONS.map(a => (
          <button key={a.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer' }}>
            <div style={{ width: 52, height: 52, borderRadius: 16, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{a.icon}</div>
            <span style={{ fontSize: 11, color: '#9999aa', fontWeight: 600 }}>{a.label}</span>
          </button>
        ))}
      </div>

      {/* Recent */}
      <div style={{ padding: '0 16px' }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: '#e5e5ea', margin: '0 0 14px' }}>Недавнее</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {RECENT.map(item => (
            <div key={item.id} style={{ display: 'flex', gap: 12, padding: '12px', background: '#0d0d12', borderRadius: 14, border: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer' }}>
              <img src={item.img} alt={item.title} style={{ width: 52, height: 52, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#e5e5ea', marginBottom: 3 }}>{item.title}</div>
                <div style={{ fontSize: 12, color: '#6b6b7a' }}>{item.category} · {item.time}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
