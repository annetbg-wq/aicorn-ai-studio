export type Candidate = { id: string; name: string; age: number; bio: string; tags: string[]; distance: string; score: number; liked?: boolean; };
export type Match = { id: string; name: string; lastMessage: string; unread: number; };
export type ChatMessage = { id: string; from: string; text: string; mine: boolean; };
