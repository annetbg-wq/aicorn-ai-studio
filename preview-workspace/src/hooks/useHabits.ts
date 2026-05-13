import { useState, useCallback, useEffect } from 'react';
import { Habit, Category, WeeklyStats } from '@/data/types';
import {
  getHabits,
  getCategories,
  addHabit as addHabitHelper,
  toggleHabitCompletion as toggleHelper,
  deleteHabit as deleteHelper,
  updateHabit as updateHelper,
  getWeeklyStats as getWeeklyStatsHelper,
} from '@/data/habits';

export function useHabits() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setHabits(getHabits());
    setCategories(getCategories());
    setLoading(false);
  }, []);

  const refresh = useCallback(() => {
    setHabits(getHabits());
    setCategories(getCategories());
  }, []);

  const addHabit = useCallback((habit: Habit) => {
    const updated = addHabitHelper(habit);
    setHabits(updated);
  }, []);

  const toggleCompletion = useCallback((habitId: string, date: string) => {
    const updated = toggleHelper(habitId, date);
    setHabits(updated);
  }, []);

  const deleteHabit = useCallback((habitId: string) => {
    const updated = deleteHelper(habitId);
    setHabits(updated);
  }, []);

  const updateHabit = useCallback((habitId: string, updates: Partial<Habit>) => {
    const updated = updateHelper(habitId, updates);
    setHabits(updated);
  }, []);

  const getTodayHabits = useCallback((): Habit[] => {
    const today = new Date().toISOString().split('T')[0];
    return habits.filter(h => {
      const created = new Date(h.createdAt);
      const todayDate = new Date();
      created.setHours(0, 0, 0, 0);
      todayDate.setHours(0, 0, 0, 0);
      return created <= todayDate;
    });
  }, [habits]);

  const getWeeklyStats = useCallback((): WeeklyStats[] => {
    return getWeeklyStatsHelper(habits);
  }, [habits]);

  const getHabitsByCategory = useCallback((categoryId: string | null): Habit[] => {
    if (!categoryId) return habits;
    return habits.filter(h => h.categoryId === categoryId);
  }, [habits]);

  return {
    habits,
    categories,
    loading,
    refresh,
    addHabit,
    toggleCompletion,
    deleteHabit,
    updateHabit,
    getTodayHabits,
    getWeeklyStats,
    getHabitsByCategory,
  };
}
