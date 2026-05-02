import { useParams, useNavigate } from 'react-router-dom';

const SEED_ITEMS: Record<string, { id: string; title: string; category: string; date: string; image: string; likes: number; body: string }> = {
  '1': { id: '1', title: 'Как AI меняет индустрию дизайна в 2026 году', category: 'Технологии', date: '26 апр', image: 'https://source.unsplash.com/800x400/?technology,ai', likes: 142, body: 'Искусственный интеллект трансформирует творческие процессы. Дизайнеры используют AI-инструменты для генерации прототипов, автоматизации рутинных задач и создания персонализированного контента. В 2026 году более 60% дизайн-студий интегрировали AI в свой рабочий процесс. Это не заменяет дизайнеров — оно усиливает их возможности.' },
  '2': { id: '2', title: 'Принципы минималистичного UI для мобильных приложений', category: 'Дизайн', date: '25 апр', image: 'https://source.unsplash.com/800x400/?design,minimal', likes: 89, body: 'Минимализм в мобильном UI — это не отсутствие элементов, а их правильный выбор. Каждый элемент интерфейса должен нести функцию. Убирайте всё лишнее. Используйте белое пространство как инструмент. Цвет применяйте с умом — один акцентный цвет для важных действий. Типографика должна работать без иконок.' },
  '3': { id: '3', title: 'Как запустить стартап с нулевым бюджетом в 2026', category: 'Бизнес', date: '24 апр', image: 'https://source.unsplash.com/800x400/?startup,business', likes: 234, body: 'В эпоху AI-инструментов и no-code платформ запуск стартапа стал доступнее чем когда-либо. Используйте AI для создания MVP, бесплатные тарифы облачных сервисов, и сосредоточьтесь на продажах с первого дня. Первые клиенты — лучшее финансирование.' },
  '4': { id: '4', title: 'React 19: Что нового и как использовать Server Components', category: 'Технологии', date: '23 апр', image: 'https://source.unsplash.com/800x400/?code,programming', likes: 178, body: 'React 19 принес Server Components в mainstream. Они позволяют рендерить компоненты на сервере, уменьшая размер bundle и улучшая SEO. Actions упрощают работу с формами. use() hook позволяет читать Promise и Context в любом месте компонента.' },
  '5': { id: '5', title: 'Нейропластичность: как мозг учится новому в любом возрасте', category: 'Наука', date: '22 апр', image: 'https://source.unsplash.com/800x400/?brain,science', likes: 95, body: 'Нейропластичность — способность мозга перестраивать нейронные связи — сохраняется на протяжении всей жизни. Регулярное обучение новым навыкам, физические упражнения и качественный сон — ключевые факторы поддержания когнитивных функций.' },
};

export default function DetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const item = id ? SEED_ITEMS[id] : null;

  if (!item) return (
    <div style={{ padding: 24, color: '#e5e5ea', textAlign: 'center' }}>
      <p>Материал не найден</p>
      <button onClick={() => navigate('/feed')} style={{ marginTop: 16, padding: '10px 20px', borderRadius: 10, background: '#a78bfa', border: 'none', color: '#fff', cursor: 'pointer' }}>Назад</button>
    </div>
  );

  return (
    <div style={{ background: '#07070b', minHeight: '100vh' }}>
      <div style={{ position: 'relative' }}>
        <img src={item.image} alt={item.title} style={{ width: '100%', height: 220, objectFit: 'cover' }} />
        <button onClick={() => navigate(-1)} style={{ position: 'absolute', top: 16, left: 16, width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
      </div>
      <div style={{ padding: '20px 16px' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <span style={{ padding: '4px 10px', borderRadius: 20, background: 'rgba(167,139,250,0.15)', color: '#a78bfa', fontSize: 12, fontWeight: 600 }}>{item.category}</span>
          <span style={{ fontSize: 12, color: '#6b6b7a', lineHeight: '26px' }}>{item.date}</span>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#e5e5ea', margin: '0 0 16px', lineHeight: 1.3 }}>{item.title}</h1>
        <p style={{ fontSize: 15, color: '#9999aa', lineHeight: 1.7, margin: 0 }}>{item.body}</p>
        <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
          <button style={{ padding: '10px 20px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e5ea', fontSize: 14, cursor: 'pointer' }}>❤️ {item.likes}</button>
          <button style={{ padding: '10px 20px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e5ea', fontSize: 14, cursor: 'pointer' }}>🔗 Поделиться</button>
        </div>
      </div>
    </div>
  );
}
