import type { Booking, Service } from './types';
export const services: Service[] = [
 { id:'srv-1', title:'Deep tissue massage', category:'Wellness', provider:'Luna Spa', price:95, rating:4.9, duration:'60 min', availableSlots:['10:00','13:30','18:00'] },
 { id:'srv-2', title:'Founder headshots', category:'Creative', provider:'North Studio', price:180, rating:4.8, duration:'90 min', availableSlots:['11:00','15:00'] },
 { id:'srv-3', title:'Pilates reformer class', category:'Fitness', provider:'Core Lab', price:36, rating:4.7, duration:'45 min', availableSlots:['08:30','17:30'] }
];
export const bookings: Booking[] = [{ id:'bk-1', serviceId:'srv-3', time:'Tomorrow 08:30', status:'Upcoming' }];
