export type Game = { id: string; title: string; category: 'Slots' | 'Table' | 'Live' | 'Crash'; rtp: number; volatility: 'Low' | 'Medium' | 'High'; featured: boolean; };
export type Bonus = { id: string; title: string; progress: number; claimed: boolean; };
export type Tournament = { id: string; title: string; rank: number; prize: string; };
