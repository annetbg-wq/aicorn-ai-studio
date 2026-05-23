export type Stage = 'Lead' | 'Qualified' | 'In Review' | 'Approved' | 'Blocked';
export type RecordItem = { id: string; company: string; owner: string; stage: Stage; value: number; priority: 'Low' | 'Medium' | 'High'; health: number; lastActivity: string; };
export type TeamMember = { id: string; name: string; role: string; load: number; avatar: string; };
export type Activity = { id: string; recordId: string; text: string; time: string; };
