import { Habit, Category } from './types';
import { DEFAULT_CATEGORIES, SEED_HABITS } from './seed';

const STORAGE_KEY_HABITS = 'habits';
const STORAGE_KEY_CATEGORIES = 'categories';

export function getHabits(): Habit[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_HABITS);
    if (stored) {
      return JSON.parse(stored);
    }
    localStorage.setItem(STORAGE_KEY_HABITS, JSON.stringify(SEED_HABITS));
    return SEED_HABITS;
  } catch {
    return SEED_HABITS;
  }
}

export function saveHabits(habits: Habit[]): void {
  localStorage.setItem(STORAGE_KEY_HABITS, JSON.stringify(habits));
}

export function getCategories(): Category[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_CATEGORIES);
    if (stored) {
      return JSON.parse(stored);
    }
    localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(DEFAULT_CATEGORIES));
    return DEFAULT_CATEGORIES;
  } catch {
    return DEFAULT_CATEGORIES;
  }
}

export function addHabit(habit: Habit): Habit[] {
  const habits = getHabits();
  habits.unshift(habit);
  saveHabits(habits);
  return habits;
}

export function toggleHabitCompletion(habitId: string, date: string): Habit[] {
  const habits = getHabits();
  const index = habits.findIndex(h => h.id === habitId);
  if (index === -1) return habits;

  const habit = { ...habits[index] };
  const dateIndex = habit.completedDates.indexOf(date);

  if (dateIndex > -1) {
    habit.completedDates.splice(dateIndex, 1);
  } else {
    habit.completedDates.push(date);
  }

  habit.streak = calculateStreak(habit.completedDates);
  habits[index] = habit;
  saveHabits(habits);
  return habits;
}

export function deleteHabit(habitId: string): Habit[] {
  const habits = getHabits().filter(h => h.id !== habitId);
  saveHabits(habits);
  return habits;
}

export function updateHabit(habitId: string, updates: Partial<Habit>): Habit[] {
  const habits = getHabits();
  const index = habits.findIndex(h => h.id === habitId);
  if (index === -1) return habits;

  habits[index] = { ...habits[index], ...updates };
  saveHabits(habits);
  return habits;
}

export function calculateStreak(completedDates: string[]): number {
  if (completedDates.length === 0) return 0;

  const sorted = [...completedDates].sort().reverse();
  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < sorted.length; i++) {
    const expectedDate = new Date(today);
    expectedDate.setDate(expectedDate.getDate() - i);
    const expected = expectedDate.toISOString().split('T')[0];

    if (sorted[i] === expected) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

export function getWeeklyStats(habits: Habit[]): { day: string; date: string; count: number; total: number }[] {
  const days: { day: string; date: string; count: number; total: number }[] = [];
  const dayNames = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const dayName = dayNames[date.getDay()];

    let count = 0;
    habits.forEach(habit => {
      if (habit.completedDates.includes(dateStr)) {
        count++;
      }
    });

    days.push({
      day: dayName,
      date: dateStr,
      count,
      total: habits.length,
    });
  }

  return days;
}
