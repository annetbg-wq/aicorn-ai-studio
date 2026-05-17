import type { Bonus, Game, Tournament } from './types';
export const games: Game[] = [
 { id:'gm-1', title:'Neon Orchard', category:'Slots', rtp:96.4, volatility:'Medium', featured:true },
 { id:'gm-2', title:'Midnight Blackjack', category:'Table', rtp:99.1, volatility:'Low', featured:true },
 { id:'gm-3', title:'Rocket Rush Demo', category:'Crash', rtp:97.0, volatility:'High', featured:false },
 { id:'gm-4', title:'Live Riviera', category:'Live', rtp:98.0, volatility:'Medium', featured:false }
];
export const bonuses: Bonus[] = [
 { id:'bn-1', title:'Weekend chips boost', progress:64, claimed:false },
 { id:'bn-2', title:'Loyalty ladder', progress:38, claimed:false }
];
export const tournaments: Tournament[] = [
 { id:'tr-1', title:'Neon slots sprint', rank:12, prize:'25k chips' },
 { id:'tr-2', title:'Table masters', rank:7, prize:'VIP badge' }
];
