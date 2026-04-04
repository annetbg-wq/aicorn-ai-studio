export function calculateStreak(
  currentStreak: number,
  lastCompletedDate: string | null
): number {
  if (!lastCompletedDate) return 1;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const lastDate = new Date(lastCompletedDate);
  lastDate.setHours(0, 0, 0, 0);

  if (lastDate.getTime() === today.getTime()) {
    return currentStreak;
  }

  if (lastDate.getTime() === yesterday.getTime()) {
    return currentStreak + 1;
  }

  return 1;
}

export function getTodayDateString(): string {
  return new Date().toISOString().split('T')[0];
}

export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function getRecommendedCategory(stressTrigger: string): string {
  switch (stressTrigger) {
    case 'Work pressure':
      return 'Focus';
    case 'Sleep issues':
      return 'Sleep';
    case 'Social anxiety':
      return 'Stress Relief';
    default:
      return 'Stress Relief';
  }
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}