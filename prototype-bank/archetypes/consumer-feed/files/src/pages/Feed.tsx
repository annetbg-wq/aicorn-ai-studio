import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FeedCard from '../components/FeedCard';

const CATEGORIES = ['Все', 'Технологии', 'Дизайн', 'Бизнес', 'Наука'];

const SEED_ITEMS = [
  { id: '1', title: 'Как AI меняет индустрию дизайна в 2026 году', category: 'Технологии', date: '26 апр', image: 'https://source.unsplash.com/400x220/?technology,ai', likes: 142, saved: false },
  { id: '2', title: 'Принципы минималистичного UI для мобильных приложений', category: 'Дизайн', date: '25 апр', image: 'https://source.unsplash.com/400x220/?design,minimal', likes: 89, saved: true },
  { id: '3', title: 'Как запустить стартап с нулевым бюджетом в 2026', category: 'Бизнес', date: '24 апр', image: 'https://source.unsplash.com/400x220/?startup,business', likes: 234, saved: false },
  { id: '4', title: 'React 19: Что нового и как использовать Server Components', category: 'Технологии', date: '23 апр', image: 'https://source.unsplash.com/400x220/?code,programming', likes: 178, saved: false },
  { id: '5', title: 'Нейропластичность: как мозг учится новому в любом возрасте', category: 'Наука', date: '22 апр', image: 'https://source.unsplash.com/400x220/?brain,science', likes: 95, saved: true },
];

export default function FeedPage() {
  const [activeCategory, setActiveCategory] = useState('Все');
  const [items, setItems] = useState(SEED_ITEMS);
  const navigate = useNavigate();

  const filtered = activeCategory === 'Все' ? items : items.filter(i => i.category === activeCategory);

  const toggleSave = (id: string) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, saved: !item.saved } : item));
  };

  return (
    <div style={{ padding: '0 0 16px' }}>
      <div style={{ padding: '16px 16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#e5e5ea', margin: 0 }}>Лента</h1>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#a78bfa,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>👤</div>
      </div>

      {/* Categories */}
      <div style={{ display: 'flex', gap: 8, padding: '16px 16px 0', overflowX: 'auto', scrollbarWidth: 'none' }}>
        {CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setActiveCategory(cat)} style={{
            padding: '8px 16px', borderRadius: 20, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
            background: activeCategory === cat ? '#a78bfa' : 'rgba(255,255,255,0.07)',
            color: activeCategory === cat ? '#fff' : '#9999aa', fontSize: 13, fontWeight: 600,
          }}>{cat}</button>
        ))}
      </div>

      {/* Feed items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '16px' }}>
        {filtered.map(item => (
          <FeedCard key={item.id} item={item} onClick={() => navigate(`/detail/${item.id}`)} onSave={() => toggleSave(item.id)} />
        ))}
      </div>
    </div>
  );
}
