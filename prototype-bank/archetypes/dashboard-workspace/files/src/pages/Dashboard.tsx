import { useState } from 'react';
import KPICard from '../components/KPICard';

const METRICS = [
  { id: '1', label: 'Выручка', value: '₽142 500', change: 12.5, trend: 'up' as const, icon: '💰' },
  { id: '2', label: 'Пользователи', value: '3 840', change: 8.2, trend: 'up' as const, icon: '👥' },
  { id: '3', label: 'Конверсия', value: '4.7%', change: -0.3, trend: 'down' as const, icon: '📈' },
  { id: '4', label: 'Сессии', value: '12 340', change: 5.1, trend: 'up' as const, icon: '🎯' },
];

const TASKS = [
  { id: '1', title: 'Обновить онбординг для новых пользователей', status: 'В работе', priority: 'high', assignee: 'АК' },
  { id: '2', title: 'Провести A/B тест кнопки CTA', status: 'Готово', priority: 'medium', assignee: 'МИ' },
  { id: '3', title: 'Интеграция с CRM-системой', status: 'Планируется', priority: 'low', assignee: 'ПС' },
  { id: '4', title: 'Оптимизировать загрузку главной страницы', status: 'В работе', priority: 'high', assignee: 'АК' },
  { id: '5', title: 'Добавить экспорт отчётов в PDF', status: 'Планируется', priority: 'medium', assignee: 'МИ' },
];

const STATUS_COLORS: Record<string, string> = {
  'В работе': '#fbbf24',
  'Готово': '#4ade80',
  'Планируется': '#a78bfa',
};

export default function DashboardPage() {
  const [filter, setFilter] = useState('Все');
  const statuses = ['Все', 'В работе', 'Готово', 'Планируется'];
  const filtered = filter === 'Все' ? TASKS : TASKS.filter(t => t.status === filter);

  return (
    <div style={{ padding: '24px', maxWidth: 1100 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#e5e5ea', margin: '0 0 4px' }}>Дашборд</h1>
        <p style={{ fontSize: 14, color: '#6b6b7a', margin: 0 }}>Обзор ключевых метрик за последние 30 дней</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 32 }}>
        {METRICS.map(m => <KPICard key={m.id} {...m} />)}
      </div>

      <div style={{ background: '#0d0d12', borderRadius: 16, border: '1px solid rgba(255,255,255,0.07)', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#e5e5ea', margin: 0 }}>Задачи</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            {statuses.map(s => (
              <button key={s} onClick={() => setFilter(s)} style={{
                padding: '5px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: filter === s ? '#a78bfa' : 'rgba(255,255,255,0.06)',
                color: filter === s ? '#fff' : '#6b6b7a',
              }}>{s}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(task => (
            <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#e5e5ea', marginBottom: 2 }}>{task.title}</div>
              </div>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(167,139,250,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#a78bfa' }}>{task.assignee}</div>
              <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, color: STATUS_COLORS[task.status], background: STATUS_COLORS[task.status] + '20' }}>{task.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
