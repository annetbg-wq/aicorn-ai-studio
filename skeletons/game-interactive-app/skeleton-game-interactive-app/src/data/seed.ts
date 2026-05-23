import type { Achievement, LeaderboardEntry, Level } from './types';
export const levels: Level[] = [
 { id:'lv-1', title:'Signal Garden', difficulty:'Easy', locked:false, bestStars:3 },
 { id:'lv-2', title:'Crystal Switch', difficulty:'Medium', locked:false, bestStars:2 },
 { id:'lv-3', title:'Moon Gate', difficulty:'Hard', locked:false, bestStars:0 },
 { id:'lv-4', title:'Solar Vault', difficulty:'Hard', locked:true, bestStars:0 }
];
export const achievements: Achievement[] = [
 { id:'ach-1', title:'First perfect run', unlocked:true, progress:100 },
 { id:'ach-2', title:'Three-day streak', unlocked:false, progress:66 }
];
export const leaderboard: LeaderboardEntry[] = [
 { id:'lb-1', name:'You', score:8420, rank:8 },
 { id:'lb-2', name:'Mika', score:11320, rank:1 }
];
