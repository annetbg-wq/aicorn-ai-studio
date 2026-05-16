import { Category, Habit } from './types';

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'health', name: 'Здоровье', emoji: '💪' },
  { id: 'productivity', name: 'Продуктивность', emoji: '⚡' },
  { id: 'education', name: 'Образование', emoji: '📚' },
  { id: 'creativity', name: 'Творчество', emoji: '🎨' },
  { id: 'wellness', name: 'Самочувствие', emoji: '🧘' },
];

export const SEED_HABITS: Habit[] = [
  {
    id: 'seed-1',
    name: 'Утренняя зарядка',
    description: '15 минут лёгкой разминки после пробуждения',
    categoryId: 'health',
    color: '142 56% 40%',
    icon: '🏃',
    createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    completedDates: generateLastNDays(10),
    streak: 5,
    goal: 1,
  },
  {
    id: 'seed-2',
    name: 'Чтение 20 минут',
    description: 'Читать книгу перед сном',
    categoryId: 'education',
    color: '211 78% 46%',
    icon: '📖',
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    completedDates: generateLastNDays(6),
    streak: 3,
    goal: 1,
  },
  {
    id: 'seed-3',
    name: 'Медитация',
    description: '10 минут осознанного дыхания',
    categoryId: 'wellness',
    color: '185 70% 42%',
    icon: '🧘',
    createdAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString(),
    completedDates: generateLastNDays(8),
    streak: 7,
    goal: 1,
  },
];

function generateLastNDays(n: number): string[] {
  const dates: string[] = [];
  for (let i = 0; i < n; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    dates.push(date.toISOString().split('T')[0]);
  }
  return dates;
}
