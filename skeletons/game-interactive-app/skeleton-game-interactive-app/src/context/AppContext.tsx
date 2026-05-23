import { createContext, useContext, useMemo, useState } from 'react';
import { achievements as seedAchievements, leaderboard as seedLeaderboard, levels as seedLevels } from '@/data/seed';
import type { Achievement, LeaderboardEntry, Level } from '@/data/types';
type AppContextValue = { activeRoute: string; setActiveRoute: (route: string) => void; levels: Level[]; achievements: Achievement[]; leaderboard: LeaderboardEntry[]; currentLevelId: string; score: number; coins: number; streak: number; startLevel: (id: string) => void; completeLevel: (stars: number) => void; unlockAchievement: (id: string) => void; progress: number; };
const AppContext = createContext<AppContextValue | null>(null);
export function AppProvider({ children }: { children: React.ReactNode }) {
 const [activeRoute, setActiveRoute] = useState('Home'); const [levels, setLevels] = useState(seedLevels); const [achievements, setAchievements] = useState(seedAchievements); const [currentLevelId, setCurrentLevelId] = useState(seedLevels[0]?.id ?? ''); const [score, setScore] = useState(8420); const [coins, setCoins] = useState(380); const [streak, setStreak] = useState(4);
 const progress = useMemo(() => Math.round((levels.filter((level) => level.bestStars > 0).length / levels.length) * 100), [levels]);
 const startLevel = (id: string) => { setCurrentLevelId(id); setActiveRoute('GameScreen'); };
 const completeLevel = (stars: number) => { setLevels((current) => current.map((level) => level.id === currentLevelId ? { ...level, bestStars: Math.max(level.bestStars, stars) } : level)); setScore((current) => current + stars * 500); setCoins((current) => current + stars * 25); setStreak((current) => current + 1); };
 const unlockAchievement = (id: string) => setAchievements((current) => current.map((achievement) => achievement.id === id ? { ...achievement, unlocked:true, progress:100 } : achievement));
 const value = { activeRoute, setActiveRoute, levels, achievements, leaderboard: seedLeaderboard, currentLevelId, score, coins, streak, startLevel, completeLevel, unlockAchievement, progress };
 return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
export function useApp() { const ctx = useContext(AppContext); if (!ctx) throw new Error('useApp must be used inside AppProvider'); return ctx; }
