export type Draft = { id: string; title: string; status: 'Draft' | 'Review' | 'Published'; words: number; updated: string; body: string; };
export type MediaAsset = { id: string; title: string; type: 'image' | 'audio' | 'video'; used: boolean; };
export type Publication = { id: string; title: string; views: number; engagement: number; };
