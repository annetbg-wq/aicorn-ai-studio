import type { Candidate, ChatMessage, Match } from './types';
export const candidates: Candidate[] = [
 { id:'can-1', name:'Ava', age:29, bio:'Design founder, sunrise runner, obsessed with small coffee places.', tags:['Design','Startups','Running'], distance:'2 km', score:94 },
 { id:'can-2', name:'Mila', age:31, bio:'Product strategist who plans trips around bookstores.', tags:['Books','Travel','Strategy'], distance:'5 km', score:88 },
 { id:'can-3', name:'Lina', age:27, bio:'Photographer, salsa beginner, weekend market hunter.', tags:['Photo','Music','Food'], distance:'8 km', score:82 }
];
export const matches: Match[] = [{ id:'m-1', name:'Sofia', lastMessage:'That gallery looks perfect for Friday.', unread:2 }];
export const messages: ChatMessage[] = [
 { id:'c-1', from:'Sofia', text:'You mentioned jazz nights?', mine:false },
 { id:'c-2', from:'You', text:'Yes, there is one near the old theatre.', mine:true }
];
