export type Service = { id: string; title: string; category: string; provider: string; price: number; rating: number; duration: string; availableSlots: string[]; };
export type Booking = { id: string; serviceId: string; time: string; status: 'Upcoming' | 'Completed' | 'Cancelled'; rating?: number; };
