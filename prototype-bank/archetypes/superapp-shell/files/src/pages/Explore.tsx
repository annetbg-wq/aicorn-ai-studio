import { useState } from 'react';

const CATEGORIES = [
  { id: '1', name: 'Технологии', icon: '💻', count: 142 },
  { id: '2', name: 'Дизайн', icon: '🎨', count: 89 },
  { id: '3', name: 'Бизнес', icon: '📊', count: 234 },
  { id: '4', name: 'Наука', icon: '🔬', count: 67 },
  { id: '5', name: 'Культура', icon: '🎭', count: 118 },
  { id: '6', name: 'Спорт', icon: '⚽', count: 95 },
];

const TRENDING = [
  { id: '1', title: 'Тренд 1', views: '12.4k', img: 'https://source.unsplash.com/200x120/?trend1' },
  { id: '2', title: 'Тренд 2', views: '8.9k', img: 'https://source.unsplash.com/200x120/?trend2' },
  { id: '3', title: 'Тренд 3', views: '6.2k', img: 'https://source.unsplash.com/200x120/?trend3' },
];

export default function ExplorePage() {
  const [search, setSearch] = useState('');

  return (
    <div style={{ padding: '16px' }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, color: '#e5e5ea', margin: '0 0 16px' }}>Explore</h1>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Поиск по всему контенту..." style={{ width: '100%', padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e5ea', fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 24 }} />

      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#e5e5ea', margin: '0 0 12px' }}>Категории</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
        {CATEGORIES.map(cat => (
          <div key={cat.id} style={{ padding: '14px', background: '#0d0d12', borderRadius: 14, border: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>{cat.icon}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#e5e5ea' }}>{cat.name}</div>
              <div style={{ fontSize: 11, color: '#6b6b7a' }}>{cat.count} материалов</div>
            </div>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#e5e5ea', margin: '0 0 12px' }}>В тренде</h2>
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', scrollbarWidth: 'none' }}>
        {TRENDING.map(item => (
          <div key={item.id} style={{ minWidth: 160, borderRadius: 14, overflow: 'hidden', flexShrink: 0, cursor: 'pointer' }}>
            <img src={item.img} alt={item.title} style={{ width: '100%', height: 90, objectFit: 'cover' }} />
            <div style={{ padding: '8px', background: '#0d0d12', border: '1px solid rgba(255,255,255,0.07)', borderTop: 'none' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#e5e5ea', marginBottom: 2 }}>{item.title}</div>
              <div style={{ fontSize: 11, color: '#6b6b7a' }}>👁️ {item.views}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
