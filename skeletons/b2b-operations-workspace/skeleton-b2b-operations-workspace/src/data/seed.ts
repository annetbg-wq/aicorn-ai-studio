import type { Activity, RecordItem, TeamMember } from './types';
export const records: RecordItem[] = [
 { id:'rec-1', company:'Northstar Clinics', owner:'Maya', stage:'Qualified', value:84000, priority:'High', health:84, lastActivity:'Contract review scheduled' },
 { id:'rec-2', company:'Atlas Logistics', owner:'Jon', stage:'In Review', value:52000, priority:'Medium', health:67, lastActivity:'Ops audit uploaded' },
 { id:'rec-3', company:'Luma Foods', owner:'Priya', stage:'Lead', value:31000, priority:'Low', health:48, lastActivity:'Awaiting discovery call' },
 { id:'rec-4', company:'Cobalt Health', owner:'Maya', stage:'Approved', value:129000, priority:'High', health:93, lastActivity:'Implementation started' }
];
export const team: TeamMember[] = [
 { id:'tm-1', name:'Maya Chen', role:'Revenue Ops', load:72, avatar:'MC' },
 { id:'tm-2', name:'Jon Bell', role:'Implementation', load:58, avatar:'JB' },
 { id:'tm-3', name:'Priya Shah', role:'Success Lead', load:64, avatar:'PS' }
];
export const activities: Activity[] = [
 { id:'act-1', recordId:'rec-1', text:'Security checklist approved', time:'9:30' },
 { id:'act-2', recordId:'rec-2', text:'Field ops team requested timeline', time:'11:05' },
 { id:'act-3', recordId:'rec-4', text:'Kickoff owner assigned', time:'13:40' }
];
