export interface Habit {
  id: string;
  name: string;
  description?: string;
  categoryId: string;
  color: string;
  icon?: string;
  createdAt: string;
  completedDates: string[];
  streak: number;
  goal: number;
}

export interface Category {
  id: string;
  name: string;
  emoji: string;
}

export interface UserProfile {
  name: string;
  avatar?: string;
  joinDate: string;
  totalHabits: number;
  longestStreak: number;
}

export interface WeeklyStats {
  day: string;
  date: string;
  count: number;
  total: number;
}
