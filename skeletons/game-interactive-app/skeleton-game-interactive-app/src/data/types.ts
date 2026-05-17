export type Level = { id: string; title: string; difficulty: 'Easy' | 'Medium' | 'Hard'; locked: boolean; bestStars: number; };
export type Achievement = { id: string; title: string; unlocked: boolean; progress: number; };
export type LeaderboardEntry = { id: string; name: string; score: number; rank: number; };
