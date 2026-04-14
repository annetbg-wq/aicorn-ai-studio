const COUNTER_KEY = 'tally-counter';

interface CounterData {
  value: number;
  startedAt: string;
}

export function loadCounter(): CounterData | null {
  try {
    const data = localStorage.getItem(COUNTER_KEY);
    if (!data) return null;
    const parsed = JSON.parse(data);
    if (
      typeof parsed.value === 'number' &&
      typeof parsed.startedAt === 'string'
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveCounter(value: number, startedAt: string): void {
  try {
    const data: CounterData = { value, startedAt };
    localStorage.setItem(COUNTER_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Failed to save counter to localStorage:', error);
  }
}