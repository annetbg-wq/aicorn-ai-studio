export type Listing = { id: string; title: string; seller: string; category: string; price: number; rating: number; saved: boolean; imageTone: string; };
export type Order = { id: string; listingId: string; status: 'Pending' | 'Confirmed' | 'Delivered'; total: number; };
export type Message = { id: string; from: string; text: string; mine: boolean; };
